"use client";

/**
 * 照片生成物件：上传照片 → AI 生成参数化规格 → 3D / 俯视预览 → 调整名称 / 分类 / 尺寸 → 可带反馈再生成 → 保存进物件库。
 */
import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { toast } from "sonner";
import { ImagePlus, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { api, ApiClientError, fetcher } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { downscaleImage, type DownscaledImage } from "@/lib/image/downscale";
import type { GeneratedObject } from "@/lib/ai/object-spec-schema";
import { OBJECT_CATEGORIES, projectTopDown, toObjectSpec } from "@/lib/ai/object-spec-schema";
import { specHeight, type ObjectSpec } from "@/lib/map/object-spec";
import { CATEGORY_LABELS } from "@/lib/map/catalog";
import type { ObjectTypeSummary } from "@/lib/map/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ObjectPreview = dynamic(() => import("@/components/map3d/object-preview").then((m) => m.ObjectPreview), { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-xs text-muted-foreground">载入 3D 预览…</div> });

function describeError(e: unknown): string {
  if (e instanceof ApiClientError) return typeof e.body?.message === "string" ? e.body.message : errorMessage(e.code);
  return e instanceof Error ? e.message : String(e);
}

/** 俯视符号（保存前预览，与画布上的 ObjectGlyph 同一投影） */
export function TopDownPreview({ spec, size = 120 }: { spec: ObjectSpec; size?: number }) {
  const shapes = useMemo(() => projectTopDown(spec), [spec]);
  const [w, d] = spec.footprint;
  const k = size / Math.max(w, d);
  return (
    <svg width={w * k} height={d * k} viewBox={`0 0 ${w} ${d}`} className="rounded border border-border bg-(--bp-paper)">
      <rect x={0} y={0} width={w} height={d} fill="none" stroke="var(--bp-line)" strokeWidth={1 / k} strokeDasharray={`${4 / k} ${3 / k}`} />
      {shapes.map((s, i) =>
        s.kind === "circle" ? <ellipse key={i} cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} fill="var(--bp-object)" stroke="var(--bp-line)" strokeWidth={1 / k} /> : <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill="var(--bp-object)" stroke="var(--bp-line)" strokeWidth={1 / k} />,
      )}
    </svg>
  );
}

export function ObjectFromPhotoDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (t: ObjectTypeSummary) => void }) {
  const { data: ai } = useSWR<{ configured: boolean; model: string | null }>(open ? "/api/ai/status" : null, fetcher);
  const [img, setImg] = useState<DownscaledImage | null>(null);
  const [prompt, setPrompt] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedObject | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("office");
  const [dims, setDims] = useState<{ w: number; d: number; h: number }>({ w: 100, d: 60, h: 75 });

  const spec = useMemo<ObjectSpec | null>(() => {
    if (!generated) return null;
    const base = toObjectSpec(generated, "preview");
    // 用户改了尺寸：按轴等比缩放部件
    const sx = dims.w / base.footprint[0];
    const sz = dims.d / base.footprint[1];
    const sy = dims.h / specHeight(base);
    return {
      ...base,
      footprint: [dims.w, dims.d],
      height: dims.h,
      parts: base.parts.map((p) => ({ ...p, size: [p.size[0] * sx, p.size[1] * sy, p.size[2] * sz] as [number, number, number], pos: [p.pos![0] * sx, p.pos![1] * sy, p.pos![2] * sz] as [number, number, number], radius: p.radius !== undefined ? p.radius * Math.min(sx, sy, sz) : undefined })),
    };
  }, [dims, generated]);

  const reset = () => {
    setImg(null);
    setGenerated(null);
    setError(null);
    setFeedback("");
    setPrompt("");
  };

  const pick = useCallback(async (f: File) => {
    try {
      setImg(await downscaleImage(f, 1280));
      setGenerated(null);
    } catch (e) {
      toast.error(`读取图片失败：${describeError(e)}`);
    }
  }, []);

  const generate = useCallback(
    async (withFeedback: boolean) => {
      if (!img) return;
      setBusy(true);
      setError(null);
      try {
        const res = await api<{ result: GeneratedObject }>("/api/ai/object/recognize", {
          method: "POST",
          json: { image: { mime: img.mime, base64: img.base64 }, prompt: prompt || undefined, ...(withFeedback && generated && feedback ? { previous: generated, feedback } : {}) },
        });
        setGenerated(res.result);
        setName(res.result.name);
        setCategory(res.result.category);
        setDims({ w: Math.round(res.result.footprint[0]), d: Math.round(res.result.footprint[1]), h: Math.round(res.result.height) });
        setFeedback("");
      } catch (e) {
        setError(describeError(e));
      } finally {
        setBusy(false);
      }
    },
    [feedback, generated, img, prompt],
  );

  const save = useCallback(async () => {
    if (!spec || !name.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ object: ObjectTypeSummary & { key: string } }>("/api/objects", { method: "POST", json: { name: name.trim(), category, w: dims.w, d: dims.d, h: dims.h, spec: { ...spec, id: "custom" } } });
      onCreated(res.object);
      toast.success(`已加入物件库：${res.object.name}`);
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(false);
    }
  }, [category, dims, name, onCreated, onOpenChange, spec]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            照片生成物件
          </DialogTitle>
          <DialogDescription>上传一张桌子 / 柜子 / 沙发的照片，AI 会用简单几何体拼出一个可放进楼层的 3D 物件；保存后出现在物件库「自定义」分类。{ai && !ai.configured ? " 服务端未配置 AI 模型。" : ""}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[300px_1fr] gap-4">
          <div className="space-y-3">
            <label className="flex min-h-40 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/40 p-2">
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.dataUrl} alt="照片" className="max-h-56 max-w-full rounded object-contain" />
              ) : (
                <span className="text-center text-xs text-muted-foreground">
                  <ImagePlus className="mx-auto mb-1 h-6 w-6" />
                  点击选择照片
                </span>
              )}
            </label>
            <div>
              <Label className="text-xs">要求（可选）</Label>
              <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="如：这是 1.4 m 宽的升降桌" className="h-8 text-xs" />
            </div>
            <Button className="w-full" disabled={!img || busy || !ai?.configured} onClick={() => void generate(false)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generated ? "重新生成" : "生成 3D 物件"}
            </Button>
            {generated && (
              <div className="flex gap-1">
                <Input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="反馈：再矮一点 / 去掉屏幕…" className="h-8 text-xs" />
                <Button variant="outline" size="icon-sm" disabled={!feedback || busy} onClick={() => void generate(true)} aria-label="按反馈重做">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <div className="h-64 overflow-hidden rounded-xl border border-border">{spec ? <ObjectPreview spec={spec} /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">生成后在这里预览（可拖动旋转）</div>}</div>
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border p-2">
                {spec ? <TopDownPreview spec={spec} size={110} /> : <span className="text-[11px] text-muted-foreground">俯视符号</span>}
                {generated?.assumptions && <p className="text-[10px] text-muted-foreground">{generated.assumptions}</p>}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_120px_repeat(3,80px)] gap-2">
              <div>
                <Label className="text-xs">名称</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">分类</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OBJECT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(["w", "d", "h"] as const).map((k) => (
                <div key={k}>
                  <Label className="text-xs">{{ w: "宽", d: "深", h: "高" }[k]} cm</Label>
                  <Input type="number" value={dims[k]} onChange={(e) => setDims((o) => ({ ...o, [k]: Math.max(2, Number(e.target.value) || 0) }))} className="h-8 text-xs" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button disabled={!spec || !name.trim() || busy} onClick={() => void save()}>
                保存到物件库
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
