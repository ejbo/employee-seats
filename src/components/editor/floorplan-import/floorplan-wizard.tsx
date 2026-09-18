"use client";

/**
 * 导入户型图向导：上传 → AI 识别（可跳过）→ 校对（拖顶点 / 改名 / 改类型 / 增删房间与门，磁性吸附到图上的边缘）
 * → 标定比例 → 生成房间 / 墙 / 门写入编辑器（并把图片设为 20% 底图）。
 */
import { useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ImagePlus, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api, ApiClientError, fetcher } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { computeEdgeMap, downscaleImage, snapToEdge, type DownscaledImage, type EdgeMap } from "@/lib/image/downscale";
import { normalizeRecognized, rectilinearize, ROOM_TYPES, toFloorElements, type Recognized } from "@/lib/ai/floorplan";
import type { RoomType } from "@/lib/map/types";
import { ROOM_TYPE_LABELS } from "@/lib/map/types";
import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Step = "upload" | "recognize" | "review" | "calibrate";
type Pt = [number, number];

interface AiStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
}

const EMPTY: Recognized = { rooms: [], walls: [], doors: [], scaleHints: [] };

function describeError(e: unknown): string {
  if (e instanceof ApiClientError) return typeof e.body?.message === "string" ? e.body.message : errorMessage(e.code);
  return e instanceof Error ? e.message : String(e);
}

export function FloorplanWizard({ open, onOpenChange, floorId }: { open: boolean; onOpenChange: (o: boolean) => void; floorId: string }) {
  const { data: ai } = useSWR<AiStatus>(open ? "/api/ai/status" : null, fetcher);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<DownscaledImage | null>(null);
  const [edge, setEdge] = useState<EdgeMap | null>(null);
  const [hints, setHints] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Recognized>(EMPTY);
  const [magnetic, setMagnetic] = useState(true);
  // 标定
  const [scaleLine, setScaleLine] = useState<{ a: Pt; b: Pt } | null>(null);
  const [scaleMeters, setScaleMeters] = useState("6");
  const [totalWidthM, setTotalWidthM] = useState("30");
  const [scaleMode, setScaleMode] = useState<"line" | "hint" | "width">("width");
  const [hintIndex, setHintIndex] = useState(0);
  const [replace, setReplace] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setImg(null);
    setEdge(null);
    setResult(EMPTY);
    setError(null);
    setScaleLine(null);
    setBusy(false);
  }, []);

  const pick = useCallback(async (f: File) => {
    try {
      setBusy(true);
      const d = await downscaleImage(f);
      setFile(f);
      setImg(d);
      setEdge(await computeEdgeMap(d.dataUrl));
    } catch (e) {
      toast.error(`读取图片失败：${describeError(e)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const recognize = useCallback(async () => {
    if (!img) return;
    setBusy(true);
    setError(null);
    setStep("recognize");
    try {
      const res = await api<{ result: Recognized }>("/api/ai/floorplan/recognize", { method: "POST", json: { floorId, image: { mime: img.mime, base64: img.base64 }, hints: hints || undefined } });
      setResult(normalizeRecognized(res.result));
      if (res.result.scaleHints.length) setScaleMode("hint");
      setStep("review");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }, [floorId, hints, img]);

  const aspect = img ? img.height / img.width : 1;
  const cmPerUnit = useMemo(() => {
    if (scaleMode === "line" && scaleLine) {
      const dx = scaleLine.b[0] - scaleLine.a[0];
      const dy = (scaleLine.b[1] - scaleLine.a[1]) * aspect;
      const len = Math.hypot(dx, dy);
      const m = Number(scaleMeters);
      return len > 1 && m > 0 ? (m * 100) / len : null;
    }
    if (scaleMode === "hint") {
      const h = result.scaleHints[hintIndex];
      if (!h) return null;
      const m = h.meters ?? Number(h.text) / 1000;
      const len = Math.hypot(h.to[0] - h.from[0], (h.to[1] - h.from[1]) * aspect);
      return len > 1 && m > 0 ? (m * 100) / len : null;
    }
    const w = Number(totalWidthM);
    return w > 0 ? (w * 100) / 1000 : null;
  }, [aspect, hintIndex, result.scaleHints, scaleLine, scaleMeters, scaleMode, totalWidthM]);

  const generated = useMemo(() => (cmPerUnit ? toFloorElements(result, { cmPerUnit, aspect, gridSize: useEditorStore.getState().meta.gridSize }) : null), [aspect, cmPerUnit, result]);

  const apply = useCallback(async () => {
    if (!generated || !file || !cmPerUnit) return;
    setBusy(true);
    try {
      const st = useEditorStore.getState();
      // 底图：上传原图，按比例铺满
      let backgroundKey: string | null = st.meta.backgroundKey;
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await api<{ backgroundKey: string }>(`/api/floors/${floorId}/background`, { method: "POST", body: fd });
        backgroundKey = res.backgroundKey;
      } catch (e) {
        toast.message(`底图上传失败（不影响生成）：${describeError(e)}`);
      }
      if (replace) {
        const decorIds = Object.values(st.elements)
          .filter((e) => e.kind === "room" || e.kind === "wall" || e.kind === "door" || e.kind === "label" || e.kind === "furniture")
          .map((e) => e.id);
        if (decorIds.length) st.remove(decorIds);
      }
      const bgW = Math.round(1000 * cmPerUnit);
      const bgH = Math.round(bgW * aspect);
      useEditorStore.getState().setMeta({
        width: Math.max(st.meta.width, generated.width),
        height: Math.max(st.meta.height, generated.height),
        backgroundKey,
        background: backgroundKey ? { x: 0, y: 0, w: bgW, h: bgH, opacity: 0.2, locked: true } : st.meta.background,
      });
      useEditorStore.getState().addMany(generated.elements, { select: false });
      const rooms = generated.elements.filter((e) => e.kind === "room").length;
      const doors = generated.elements.filter((e) => e.kind === "door").length;
      const walls = generated.elements.filter((e) => e.kind === "wall").length;
      toast.success(`已生成 ${rooms} 个房间、${walls} 段墙、${doors} 扇门${generated.skippedDoors ? `（${generated.skippedDoors} 扇门找不到所在的边，已跳过）` : ""}`);
      onOpenChange(false);
      reset();
    } finally {
      setBusy(false);
    }
  }, [aspect, cmPerUnit, file, floorId, generated, onOpenChange, replace, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            导入户型图
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {(["upload", "recognize", "review", "calibrate"] as Step[]).map((s, i) => (
                <span key={s} className={s === step ? "text-foreground" : ""}>
                  {i > 0 ? " › " : ""}
                  {{ upload: "① 上传", recognize: "② 识别", review: "③ 校对", calibrate: "④ 比例与生成" }[s]}
                </span>
              ))}
            </span>
          </DialogTitle>
          <DialogDescription>把户型图变成可编辑的房间 / 墙 / 门，而不是只当底图。{ai && !ai.configured ? " 服务端未配置 AI 模型，可以手动描摹。" : ai?.model ? ` AI：${ai.model}` : ""}</DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="grid grid-cols-[1fr_260px] gap-4">
            <div
              className="flex min-h-72 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void pick(f);
              }}
            >
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.dataUrl} alt="户型图" className="max-h-96 max-w-full object-contain" />
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  <ImagePlus className="mx-auto mb-2 h-8 w-8" />
                  拖入 PNG / JPG 户型图，或
                  <Button variant="link" className="px-1" onClick={() => fileRef.current?.click()}>
                    选择文件
                  </Button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">给模型的补充说明（可选）</Label>
                <Input value={hints} onChange={(e) => setHints(e.target.value)} placeholder="如：这是 3F，上北；灰色区域是公共走廊" className="h-8 text-xs" />
              </div>
              <Button className="w-full" disabled={!img || busy || !ai?.configured} onClick={() => void recognize()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                AI 识别房间 / 墙 / 门
              </Button>
              <Button variant="outline" className="w-full" disabled={!img || busy} onClick={() => setStep("review")}>
                跳过识别，手动描摹
              </Button>
              {img && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => fileRef.current?.click()}>
                  换一张
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">图片在浏览器里缩到 ≤1568px 后再发送；识别只提取房间、墙、门与功能标注，工位之后用「填充工位」或导入落座。</p>
            </div>
          </div>
        )}

        {step === "recognize" && (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            {busy ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                正在识别，通常需要 10–60 秒…
              </>
            ) : (
              <>
                <p className="max-w-lg text-center text-danger">{error}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("upload")}>
                    返回
                  </Button>
                  <Button onClick={() => void recognize()}>重试</Button>
                  <Button variant="ghost" onClick={() => setStep("review")}>
                    改为手动描摹
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "review" && img && (
          <ReviewStep img={img} edge={magnetic ? edge : null} result={result} onChange={setResult} magnetic={magnetic} onMagnetic={setMagnetic} onBack={() => setStep("upload")} onNext={() => setStep("calibrate")} />
        )}

        {step === "calibrate" && img && (
          <div className="grid grid-cols-[1fr_300px] gap-4">
            <ScaleCanvas img={img} line={scaleLine} onLine={(l) => { setScaleLine(l); setScaleMode("line"); }} result={result} />
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={scaleMode === "width"} onChange={() => setScaleMode("width")} />
                  楼层图总宽
                  <Input value={totalWidthM} onChange={(e) => setTotalWidthM(e.target.value)} className="h-7 w-20 text-xs" /> m
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={scaleMode === "line"} onChange={() => setScaleMode("line")} />
                  在图上拉一条线，长度
                  <Input value={scaleMeters} onChange={(e) => setScaleMeters(e.target.value)} className="h-7 w-16 text-xs" /> m
                </label>
                {result.scaleHints.length > 0 && (
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={scaleMode === "hint"} onChange={() => setScaleMode("hint")} />
                    用图上的尺寸标注
                    <Select value={String(hintIndex)} onValueChange={(v) => setHintIndex(Number(v))}>
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {result.scaleHints.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h.text}（{h.meters ?? Number(h.text) / 1000} m）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                )}
              </div>
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {cmPerUnit && generated ? (
                  <>
                    比例：图上 1000 单位 = {(cmPerUnit * 10).toFixed(1)} m · 楼层 {generated.width / 100} × {generated.height / 100} m
                    <br />
                    将生成 {generated.elements.filter((e) => e.kind === "room").length} 个房间、{generated.elements.filter((e) => e.kind === "wall").length} 段墙、{generated.elements.filter((e) => e.kind === "door").length} 扇门
                  </>
                ) : (
                  "请先确定比例"
                )}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={replace} onCheckedChange={setReplace} />
                替换现有的房间 / 墙 / 门 / 物件（座位与部门区域保留）
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep("review")}>
                  返回校对
                </Button>
                <Button disabled={!generated || busy || generated.elements.length === 0} onClick={() => void apply()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  生成到楼层
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── 校对层 ──────────────────────────────────────────────────────────────────
function ReviewStep({
  img,
  edge,
  result,
  onChange,
  magnetic,
  onMagnetic,
  onBack,
  onNext,
}: {
  img: DownscaledImage;
  edge: EdgeMap | null;
  result: Recognized;
  onChange: (r: Recognized) => void;
  magnetic: boolean;
  onMagnetic: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<"select" | "room" | "door">("select");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ kind: "vertex"; room: number; index: number } | { kind: "door"; index: number } | { kind: "draw"; start: Pt; current: Pt } | null>(null);
  const [draw, setDraw] = useState<{ start: Pt; current: Pt } | null>(null);

  const toUnits = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return [0, 0];
    return [Math.max(0, Math.min(1000, ((e.clientX - r.left) / r.width) * 1000)), Math.max(0, Math.min(1000, ((e.clientY - r.top) / r.height) * 1000))];
  }, []);
  const snap = useCallback((p: Pt): Pt => (edge ? snapToEdge(edge, p[0], p[1]) : p), [edge]);

  const updateRoom = (i: number, patch: Partial<Recognized["rooms"][number]>) => onChange({ ...result, rooms: result.rooms.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as SVGElement;
    const p = toUnits(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (mode === "room") {
      dragRef.current = { kind: "draw", start: snap(p), current: snap(p) };
      setDraw({ start: snap(p), current: snap(p) });
      return;
    }
    if (mode === "door") {
      onChange({ ...result, doors: [...result.doors, { x: p[0], y: p[1] }] });
      setMode("select");
      return;
    }
    const v = target.dataset.vertex;
    const r = target.dataset.room;
    const d = target.dataset.door;
    if (v !== undefined && r !== undefined) {
      dragRef.current = { kind: "vertex", room: Number(r), index: Number(v) };
      setSelected(Number(r));
      return;
    }
    if (d !== undefined) {
      dragRef.current = { kind: "door", index: Number(d) };
      return;
    }
    if (r !== undefined) {
      setSelected(Number(r));
      return;
    }
    setSelected(null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = dragRef.current;
    if (!g) return;
    const p = e.altKey ? toUnits(e) : snap(toUnits(e));
    if (g.kind === "vertex") {
      const room = result.rooms[g.room];
      if (!room) return;
      const pts = room.polygon.map((q, i) => (i === g.index ? p : q));
      updateRoom(g.room, { polygon: pts });
    } else if (g.kind === "door") {
      onChange({ ...result, doors: result.doors.map((d, i) => (i === g.index ? { ...d, x: p[0], y: p[1] } : d)) });
    } else {
      g.current = p;
      setDraw({ start: g.start, current: p });
    }
  };
  const onPointerUp = () => {
    const g = dragRef.current;
    dragRef.current = null;
    if (g?.kind === "vertex") {
      const room = result.rooms[g.room];
      if (room) updateRoom(g.room, { polygon: rectilinearize(room.polygon, 12) });
    }
    if (g?.kind === "draw") {
      setDraw(null);
      const x0 = Math.min(g.start[0], g.current[0]);
      const y0 = Math.min(g.start[1], g.current[1]);
      const x1 = Math.max(g.start[0], g.current[0]);
      const y1 = Math.max(g.start[1], g.current[1]);
      if (x1 - x0 > 10 && y1 - y0 > 10) {
        onChange({ ...result, rooms: [...result.rooms, { name: `房间 ${result.rooms.length + 1}`, type: "office", polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }] });
        setSelected(result.rooms.length);
      }
      setMode("select");
    }
  };

  return (
    <div className="grid grid-cols-[1fr_280px] gap-4">
      <div className="relative select-none overflow-hidden rounded-xl border border-border bg-muted/40" style={{ aspectRatio: `${img.width} / ${img.height}`, maxHeight: "60vh" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.dataUrl} alt="户型图" className="absolute inset-0 h-full w-full object-fill opacity-90" draggable={false} />
        <svg ref={svgRef} viewBox="0 0 1000 1000" preserveAspectRatio="none" className={`absolute inset-0 h-full w-full touch-none ${mode === "select" ? "" : "cursor-crosshair"}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {result.walls.map((w, i) => (
            <line key={i} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke="#1d4ed8" strokeWidth={4} vectorEffect="non-scaling-stroke" opacity={0.7} />
          ))}
          {result.rooms.map((room, i) => (
            <g key={i}>
              <polygon data-room={i} points={room.polygon.map((p) => p.join(",")).join(" ")} fill={selected === i ? "rgba(37,99,235,0.28)" : "rgba(37,99,235,0.12)"} stroke="#2563eb" strokeWidth={selected === i ? 3 : 2} vectorEffect="non-scaling-stroke" className="cursor-pointer" />
              <text x={room.polygon.reduce((s, p) => s + p[0], 0) / room.polygon.length} y={room.polygon.reduce((s, p) => s + p[1], 0) / room.polygon.length} textAnchor="middle" fontSize={22} fill="#1e3a8a" style={{ pointerEvents: "none" }}>
                {room.name || ROOM_TYPE_LABELS[room.type]}
              </text>
              {selected === i &&
                room.polygon.map((p, vi) => <circle key={vi} data-room={i} data-vertex={vi} cx={p[0]} cy={p[1]} r={7} fill="#fff" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" className="cursor-move" />)}
            </g>
          ))}
          {result.doors.map((d, i) => (
            <circle key={i} data-door={i} cx={d.x} cy={d.y} r={7} fill="#f59e0b" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" className="cursor-move" />
          ))}
          {draw && <rect x={Math.min(draw.start[0], draw.current[0])} y={Math.min(draw.start[1], draw.current[1])} width={Math.abs(draw.current[0] - draw.start[0])} height={Math.abs(draw.current[1] - draw.start[1])} fill="rgba(37,99,235,0.15)" stroke="#2563eb" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
      <div className="flex max-h-[60vh] flex-col gap-2 text-sm">
        <div className="flex gap-1">
          <Button size="sm" variant={mode === "room" ? "default" : "outline"} onClick={() => setMode(mode === "room" ? "select" : "room")}>
            ＋ 房间
          </Button>
          <Button size="sm" variant={mode === "door" ? "default" : "outline"} onClick={() => setMode(mode === "door" ? "select" : "door")}>
            ＋ 门
          </Button>
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Switch checked={magnetic} onCheckedChange={onMagnetic} />
            磁性吸附
          </label>
        </div>
        <div className="thin-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {result.rooms.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">还没有房间：点「＋ 房间」在图上拖出一个</p>}
          {result.rooms.map((room, i) => (
            <div key={i} className={`rounded-lg border p-2 ${selected === i ? "border-(--info)" : "border-border"}`} onClick={() => setSelected(i)}>
              <div className="flex items-center gap-1">
                <Input value={room.name} placeholder={ROOM_TYPE_LABELS[room.type]} onChange={(e) => updateRoom(i, { name: e.target.value })} className="h-7 text-xs" />
                <Select value={room.type} onValueChange={(v) => updateRoom(i, { type: v as RoomType })}>
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ROOM_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-danger" onClick={() => onChange({ ...result, rooms: result.rooms.filter((_, j) => j !== i) })} aria-label="删除">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {room.confidence !== undefined && room.confidence < 0.6 && <p className="mt-1 text-[10px] text-warning">识别把握不高（{Math.round(room.confidence * 100)}%），请核对</p>}
            </div>
          ))}
          {result.doors.length > 0 && (
            <p className="pt-1 text-[11px] text-muted-foreground">
              {result.doors.length} 扇门（橙点，可拖动）
              <Button variant="link" size="sm" className="h-auto px-1 text-[11px]" onClick={() => onChange({ ...result, doors: [] })}>
                清空
              </Button>
            </p>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">拖动顶点会吸到图上的线条（按住 ⌥ 关闭）；松手后自动拉直成直角。</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onBack}>
            返回
          </Button>
          <Button disabled={result.rooms.length === 0 && result.walls.length === 0} onClick={onNext}>
            下一步：比例
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 标定：在图上拉线 ────────────────────────────────────────────────────────
function ScaleCanvas({ img, line, onLine, result }: { img: DownscaledImage; line: { a: Pt; b: Pt } | null; onLine: (l: { a: Pt; b: Pt }) => void; result: Recognized }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const startRef = useRef<Pt | null>(null);
  const toUnits = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return [0, 0];
    return [((e.clientX - r.left) / r.width) * 1000, ((e.clientY - r.top) / r.height) * 1000];
  };
  return (
    <div className="relative select-none overflow-hidden rounded-xl border border-border bg-muted/40" style={{ aspectRatio: `${img.width} / ${img.height}`, maxHeight: "60vh" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.dataUrl} alt="户型图" className="absolute inset-0 h-full w-full object-fill opacity-90" draggable={false} />
      <svg
        ref={svgRef}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          startRef.current = toUnits(e);
          onLine({ a: startRef.current, b: startRef.current });
        }}
        onPointerMove={(e) => {
          if (!startRef.current) return;
          onLine({ a: startRef.current, b: toUnits(e) });
        }}
        onPointerUp={() => {
          startRef.current = null;
        }}
      >
        {result.rooms.map((room, i) => (
          <polygon key={i} points={room.polygon.map((p) => p.join(",")).join(" ")} fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
        {result.scaleHints.map((h, i) => (
          <line key={i} x1={h.from[0]} y1={h.from[1]} x2={h.to[0]} y2={h.to[1]} stroke="#16a34a" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        ))}
        {line && (
          <g>
            <line x1={line.a[0]} y1={line.a[1]} x2={line.b[0]} y2={line.b[1]} stroke="#e11d74" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            <circle cx={line.a[0]} cy={line.a[1]} r={6} fill="#e11d74" vectorEffect="non-scaling-stroke" />
            <circle cx={line.b[0]} cy={line.b[1]} r={6} fill="#e11d74" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-surface/90 px-2 py-1 text-[11px] text-muted-foreground">在图上按住拖出一条已知长度的线（如一面墙），或直接填写总宽</div>
    </div>
  );
}
