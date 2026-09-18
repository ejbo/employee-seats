"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ImagePlus, Loader2, Lock, Trash2, Unlock, Wand2 } from "lucide-react";
import type { DepartmentSummary, MapElement, RoomEl, SeatEl, SeatStatus, SeatStyle, ZoneEl } from "@/lib/map/types";
import { DEFAULT_WALL_HEIGHT, FLOOR_STYLE_LABELS, ROOM_TYPE_LABELS, SEAT_STYLE_LABELS } from "@/lib/map/types";
import { CATALOG, CATEGORY_LABELS, catalogDef, type ObjectCategory } from "@/lib/map/catalog";
import { polygonArea, polygonBounds } from "@/lib/map/rectilinear";
import { resolveDoor } from "@/lib/map/doors";
import { zoneFromRoom } from "@/lib/map/rooms";
import { DEPARTMENT_PALETTE } from "@/lib/map/colors";
import { SEAT_STATUS_LABELS } from "@/lib/labels";
import { api, ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { withBasePath } from "@/lib/base-path";
import { useEditorStore } from "@/stores/editor-store";
import { useEditorUiStore } from "@/stores/editor-ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PropertiesPanel({ departments, floorId }: { departments: Record<string, DepartmentSummary>; floorId: string }) {
  const selection = useEditorStore((s) => s.selection);
  const elements = useEditorStore((s) => s.elements);
  const selected = selection.map((id) => elements[id]).filter((e): e is MapElement => Boolean(e));

  return (
    <aside data-ui className="thin-scrollbar absolute inset-y-3 right-3 z-10 flex w-80 flex-col overflow-y-auto rounded-2xl border border-border bg-surface/95 shadow-pop backdrop-blur">
      {selected.length === 0 && <FloorProps floorId={floorId} />}
      {selected.length === 1 && <ElementProps el={selected[0]} departments={departments} />}
      {selected.length > 1 && <MultiProps els={selected} departments={departments} />}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-4 py-3 last:border-0">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{title}</div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, step = 1, min, suffix }: { value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
  return (
    <div className="relative">
      <Input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-8 pr-8 font-mono text-xs"
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-subtle">{suffix}</span>}
    </div>
  );
}

// ── 楼层设置 + 底图 ─────────────────────────────────────────────────────────
function FloorProps({ floorId }: { floorId: string }) {
  const meta = useEditorStore((s) => s.meta);
  const setMeta = useEditorStore((s) => s.setMeta);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ backgroundKey: string }>(`/api/floors/${floorId}/background`, { method: "POST", body: fd });
      // 读取图片尺寸，按楼层宽度铺满
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error("无法读取图片"));
        img.src = URL.createObjectURL(file);
      });
      const w = meta.width;
      const h = Math.round((w * dims.h) / Math.max(1, dims.w));
      setMeta({ backgroundKey: res.backgroundKey, background: { x: 0, y: 0, w, h, opacity: 0.6, locked: true } });
      toast.success("底图已上传，保存后生效");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "上传失败") : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const bg = meta.background;
  return (
    <>
      <Section title="楼层">
        <Row label="宽">
          <NumInput value={meta.width / 100} step={0.5} min={5} suffix="m" onChange={(v) => setMeta({ width: Math.max(500, Math.round(v * 100)) })} />
        </Row>
        <Row label="高">
          <NumInput value={meta.height / 100} step={0.5} min={5} suffix="m" onChange={(v) => setMeta({ height: Math.max(500, Math.round(v * 100)) })} />
        </Row>
        <Row label="网格">
          <NumInput value={meta.gridSize} step={5} min={5} suffix="cm" onChange={(v) => setMeta({ gridSize: Math.min(200, Math.max(5, Math.round(v))) })} />
        </Row>
      </Section>
      <Section title="底图">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <Button variant="default" size="sm" className="w-full" onClick={() => useEditorUiStore.getState().setFloorplanWizardOpen(true)}>
          <Wand2 className="h-3.5 w-3.5" />
          导入户型图（识别房间 / 墙 / 门）
        </Button>
        {!meta.backgroundKey ? (
          <>
            <Button variant="outline" size="sm" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              上传平面图（PNG / JPG）
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">把现有平面图作为底图，再在上面摆放工位；上传后可调整透明度和大小。</p>
          </>
        ) : (
          bg && (
            <>
              <div className="overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- 用户上传的底图，走本应用受保护的文件接口 */}
                <img src={withBasePath(`/api/files/${meta.backgroundKey}`)} alt="底图" className="max-h-28 w-full object-contain bg-muted" />
              </div>
              <Row label="透明度">
                <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity} onChange={(e) => setMeta({ background: { ...bg, opacity: Number(e.target.value) } })} className="w-full accent-(--info)" />
              </Row>
              <Row label="宽">
                <NumInput value={bg.w / 100} step={0.5} min={1} suffix="m" onChange={(v) => setMeta({ background: { ...bg, w: Math.max(100, Math.round(v * 100)), h: Math.max(100, Math.round((v * 100 * bg.h) / bg.w)) } })} />
              </Row>
              <Row label="偏移 X / Y">
                <div className="flex gap-1">
                  <NumInput value={bg.x / 100} step={0.5} suffix="m" onChange={(v) => setMeta({ background: { ...bg, x: Math.round(v * 100) } })} />
                  <NumInput value={bg.y / 100} step={0.5} suffix="m" onChange={(v) => setMeta({ background: { ...bg, y: Math.round(v * 100) } })} />
                </div>
              </Row>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setMeta({ background: { ...bg, locked: !bg.locked } })}>
                  {bg.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  {bg.locked ? "已锁定" : "未锁定"}
                </Button>
                <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  替换
                </Button>
                <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setMeta({ backgroundKey: null, background: null })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )
        )}
      </Section>
      <Section title="提示">
        <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
          <li>拖动 / 方向键移动，Shift + 方向键大步移动</li>
          <li>Alt 拖动关闭网格吸附，R 旋转 90°</li>
          <li>⌘D 复制，⌘Z 撤销，⌘S 立即保存</li>
          <li>空格 + 拖动平移画布，滚轮缩放</li>
        </ul>
      </Section>
    </>
  );
}

// ── 单个元素 ──────────────────────────────────────────────────────────────────
function ElementProps({ el, departments }: { el: MapElement; departments: Record<string, DepartmentSummary> }) {
  const patchMany = useEditorStore((s) => s.patchMany);
  const remove = useEditorStore((s) => s.remove);
  const reorder = useEditorStore((s) => s.reorder);
  const elements = useEditorStore((s) => s.elements);
  const set = (changes: Partial<MapElement>) => patchMany([el.id], (cur) => ({ ...cur, ...changes }) as MapElement);
  const zones = Object.values(elements).filter((e): e is ZoneEl => e.kind === "zone");

  const geometryRows =
    el.kind === "seat" || el.kind === "furniture" ? (
      <>
        <Row label="位置 X / Y">
          <div className="flex gap-1">
            <NumInput value={el.x} onChange={(v) => set({ x: v })} suffix="cm" />
            <NumInput value={el.y} onChange={(v) => set({ y: v })} suffix="cm" />
          </div>
        </Row>
        <Row label="宽 × 高">
          <div className="flex gap-1">
            <NumInput value={el.w} min={10} onChange={(v) => set({ w: Math.max(10, v) })} suffix="cm" />
            <NumInput value={el.h} min={10} onChange={(v) => set({ h: Math.max(10, v) })} suffix="cm" />
          </div>
        </Row>
        <Row label="旋转">
          <NumInput value={el.rotation} step={15} onChange={(v) => set({ rotation: ((v % 360) + 360) % 360 })} suffix="°" />
        </Row>
      </>
    ) : null;

  return (
    <>
      {el.kind === "seat" && (
        <Section title="座位">
          <Row label="桌型">
            <Select value={el.style} onValueChange={(v) => set({ style: v as SeatStyle })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SEAT_STYLE_LABELS) as SeatStyle[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SEAT_STYLE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="编号">
            <Input value={el.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className="h-8 font-mono text-xs" />
          </Row>
          <Row label="状态">
            <Select value={el.status} onValueChange={(v) => set({ status: v as SeatStatus })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SEAT_STATUS_LABELS) as SeatStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEAT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="区域">
            <Select value={el.zoneId ?? "none"} onValueChange={(v) => set({ zoneId: v === "none" ? null : v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">无</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="备注">
            <Textarea value={el.note} rows={2} onChange={(e) => set({ note: e.target.value })} className="text-xs" />
          </Row>
          {el.employeeId && <p className="text-[11px] text-muted-foreground">该座位有人；改为预留/停用会自动释放。</p>}
          {geometryRows}
        </Section>
      )}

      {el.kind === "zone" && (
        <Section title="区域">
          <Row label="名称">
            <Input value={el.name} onChange={(e) => set({ name: e.target.value })} className="h-8 text-xs" />
          </Row>
          <Row label="部门">
            <Select value={el.departmentId ?? "none"} onValueChange={(v) => set({ departmentId: v === "none" ? null : v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不指定</SelectItem>
                {Object.values(departments).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: d.color }} />
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="颜色">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                title="跟随部门颜色"
                onClick={() => set({ color: null })}
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] ${el.color === null ? "border-foreground" : "border-border"}`}
              >
                自
              </button>
              {DEPARTMENT_PALETTE.map((c) => (
                <button key={c} type="button" title={c} onClick={() => set({ color: c })} className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: c }}>
                  {el.color?.toLowerCase() === c.toLowerCase() && <Check className="h-3 w-3 text-white" />}
                </button>
              ))}
            </div>
          </Row>
          {el.geometry.type === "rect" && (
            <>
              <Row label="位置 X / Y">
                <div className="flex gap-1">
                  <NumInput value={el.geometry.x} suffix="cm" onChange={(v) => set({ geometry: { ...el.geometry, x: v } as ZoneEl["geometry"] })} />
                  <NumInput value={el.geometry.y} suffix="cm" onChange={(v) => set({ geometry: { ...el.geometry, y: v } as ZoneEl["geometry"] })} />
                </div>
              </Row>
              <Row label="宽 × 高">
                <div className="flex gap-1">
                  <NumInput value={el.geometry.w} min={10} suffix="cm" onChange={(v) => set({ geometry: { ...el.geometry, w: Math.max(10, v) } as ZoneEl["geometry"] })} />
                  <NumInput value={el.geometry.h} min={10} suffix="cm" onChange={(v) => set({ geometry: { ...el.geometry, h: Math.max(10, v) } as ZoneEl["geometry"] })} />
                </div>
              </Row>
            </>
          )}
          <p className="text-[11px] text-muted-foreground">区域内的座位数：{Object.values(elements).filter((e): e is SeatEl => e.kind === "seat" && e.zoneId === el.id).length}</p>
        </Section>
      )}

      {el.kind === "room" && <RoomProps el={el} set={set} />}

      {el.kind === "furniture" && (
        <Section title="物件">
          <Row label="类型">
            <Select value={el.typeKey} onValueChange={(v) => set({ typeKey: v })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {(Object.keys(CATEGORY_LABELS) as ObjectCategory[]).map((cat) => (
                  <SelectGroup key={cat}>
                    <SelectLabel>{CATEGORY_LABELS[cat]}</SelectLabel>
                    {CATALOG.filter((d) => d.category === cat).map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="名称">
            <Input value={el.name} placeholder={catalogDef(el.typeKey).name} onChange={(e) => set({ name: e.target.value })} className="h-8 text-xs" />
          </Row>
          <Row label="镜像">
            <div className="flex items-center gap-2">
              <Switch checked={el.flip} onCheckedChange={(v) => set({ flip: v })} />
              <span className="text-xs text-muted-foreground">{el.flip ? "已左右翻转" : "默认朝向"}</span>
            </div>
          </Row>
          {geometryRows}
        </Section>
      )}

      {el.kind === "label" && (
        <Section title="文字">
          <Row label="内容">
            <Input value={el.text} onChange={(e) => set({ text: e.target.value })} className="h-8 text-xs" />
          </Row>
          <Row label="字号">
            <NumInput value={el.fontSize} min={8} step={2} suffix="cm" onChange={(v) => set({ fontSize: Math.max(8, v) })} />
          </Row>
          <Row label="颜色">
            <div className="flex items-center gap-2">
              <input type="color" value={el.color ?? "#6b6b76"} onChange={(e) => set({ color: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent" />
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => set({ color: null })}>
                默认
              </Button>
            </div>
          </Row>
          <Row label="旋转">
            <NumInput value={el.rotation} step={15} onChange={(v) => set({ rotation: ((v % 360) + 360) % 360 })} suffix="°" />
          </Row>
        </Section>
      )}

      {el.kind === "wall" && (
        <Section title="墙体">
          <Row label="厚度">
            <NumInput value={el.thickness} min={1} step={5} suffix="cm" onChange={(v) => set({ thickness: Math.max(1, v) })} />
          </Row>
          <p className="text-[11px] text-muted-foreground">拖动顶点调整走向；共 {el.points.length} 个点。</p>
        </Section>
      )}

      {el.kind === "door" && <DoorProps el={el} set={set} />}

      <Section title="操作">
        {(el.kind === "room" || el.kind === "wall" || el.kind === "door" || el.kind === "furniture" || el.kind === "label") && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => reorder(el.id, "front")}>
              置顶
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => reorder(el.id, "back")}>
              置底
            </Button>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-danger hover:text-danger"
          onClick={() => {
            if (el.kind === "seat" && el.employeeId) {
              toast.error("座位上有人，请先在分配模式释放");
              return;
            }
            remove([el.id]);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </Button>
      </Section>
    </>
  );
}

// ── 多选 ──────────────────────────────────────────────────────────────────────
function MultiProps({ els, departments }: { els: MapElement[]; departments: Record<string, DepartmentSummary> }) {
  const patchMany = useEditorStore((s) => s.patchMany);
  const remove = useEditorStore((s) => s.remove);
  const elements = useEditorStore((s) => s.elements);
  const seats = els.filter((e): e is SeatEl => e.kind === "seat");
  const zones = Object.values(elements).filter((e): e is ZoneEl => e.kind === "zone");
  const ids = els.map((e) => e.id);
  void departments;
  return (
    <>
      <Section title={`已选 ${els.length} 项`}>
        <p className="text-xs text-muted-foreground">
          {seats.length > 0 && `${seats.length} 个座位`}
          {els.length - seats.length > 0 && `${seats.length > 0 ? "，" : ""}${els.length - seats.length} 个其他元素`}
        </p>
      </Section>
      {(seats.length > 0 || els.some((e) => e.kind === "furniture")) && (
        <Section title="批量几何">
          <Row label="旋转">
            <NumInput value={0} step={15} suffix="°" onChange={(v) => patchMany(ids, (e) => (e.kind === "seat" || e.kind === "furniture" || e.kind === "label" ? { ...e, rotation: ((v % 360) + 360) % 360 } : e))} />
          </Row>
          <Row label="宽 × 高">
            <div className="flex gap-1">
              <NumInput value={0} min={10} suffix="cm" onChange={(v) => v >= 10 && patchMany(ids, (e) => (e.kind === "seat" || e.kind === "furniture" ? { ...e, w: v } : e))} />
              <NumInput value={0} min={10} suffix="cm" onChange={(v) => v >= 10 && patchMany(ids, (e) => (e.kind === "seat" || e.kind === "furniture" ? { ...e, h: v } : e))} />
            </div>
          </Row>
          <p className="text-[11px] text-muted-foreground">输入后应用到所有选中的座位 / 物件。</p>
        </Section>
      )}
      {els.some((e) => e.kind === "furniture") && (
        <Section title="批量设置物件">
          <Row label="类型">
            <Select onValueChange={(v) => patchMany(ids, (e) => (e.kind === "furniture" ? { ...e, typeKey: v } : e))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择…" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {(Object.keys(CATEGORY_LABELS) as ObjectCategory[]).map((cat) => (
                  <SelectGroup key={cat}>
                    <SelectLabel>{CATEGORY_LABELS[cat]}</SelectLabel>
                    {CATALOG.filter((d) => d.category === cat).map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Section>
      )}
      {seats.length > 0 && (
        <Section title="批量设置座位">
          <Row label="桌型">
            <Select onValueChange={(v) => patchMany(seats.map((s) => s.id), (e) => (e.kind === "seat" ? { ...e, style: v as SeatStyle } : e))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择…" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SEAT_STYLE_LABELS) as SeatStyle[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SEAT_STYLE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="状态">
            <Select onValueChange={(v) => patchMany(seats.map((s) => s.id), (e) => (e.kind === "seat" ? { ...e, status: v as SeatStatus } : e))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择…" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SEAT_STATUS_LABELS) as SeatStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEAT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="区域">
            <Select onValueChange={(v) => patchMany(seats.map((s) => s.id), (e) => (e.kind === "seat" ? { ...e, zoneId: v === "none" ? null : v } : e))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">无</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </Section>
      )}
      <Section title="操作">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-danger hover:text-danger"
          onClick={() => {
            const occupied = seats.filter((s) => s.employeeId).length;
            if (occupied) toast.error(`${occupied} 个座位上有人，已跳过`);
            remove(ids.filter((id) => !(elements[id]?.kind === "seat" && (elements[id] as SeatEl).employeeId)));
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除所选
        </Button>
      </Section>
    </>
  );
}

// ── 房间 ──────────────────────────────────────────────────────────────────────
function RoomProps({ el, set }: { el: RoomEl; set: (changes: Partial<RoomEl>) => void }) {
  const b = polygonBounds(el.points);
  const area = polygonArea(el.points) / 10000;
  const lastCreatedId = useEditorStore((s) => s.lastCreatedId);
  const setTool = useEditorStore((s) => s.setTool);
  const add = useEditorStore((s) => s.add);
  const elements = useEditorStore((s) => s.elements);
  return (
    <Section title="房间">
      <Row label="名称">
        <Input
          key={el.id}
          autoFocus={lastCreatedId === el.id}
          onFocus={(e) => e.currentTarget.select()}
          value={el.name}
          placeholder={ROOM_TYPE_LABELS[el.type]}
          onChange={(e) => set({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
          }}
          className="h-8 text-xs"
        />
      </Row>
      <Row label="类型">
        <Select value={el.type} onValueChange={(v) => set({ type: v as RoomEl["type"] })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROOM_TYPE_LABELS) as RoomEl["type"][]).map((t) => (
              <SelectItem key={t} value={t}>
                {ROOM_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="地面">
        <Select value={el.floorStyle ?? "auto"} onValueChange={(v) => set({ floorStyle: v === "auto" ? null : (v as RoomEl["floorStyle"]) })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">按类型默认</SelectItem>
            {(Object.keys(FLOOR_STYLE_LABELS) as NonNullable<RoomEl["floorStyle"]>[]).map((t) => (
              <SelectItem key={t} value={t}>
                {FLOOR_STYLE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="墙高">
        <NumInput value={el.wallHeight ?? DEFAULT_WALL_HEIGHT} min={0} step={10} suffix="cm" onChange={(v) => set({ wallHeight: v === DEFAULT_WALL_HEIGHT ? null : Math.max(0, v) })} />
      </Row>
      <p className="text-[11px] text-muted-foreground">
        {(b.w / 100).toFixed(2)} × {(b.h / 100).toFixed(2)} m · {area.toFixed(1)} m² · {el.points.length} 个顶点
        {el.type === "corridor" ? " · 走廊不生成墙" : ""}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => setTool("room-add")} title="在房间上再拖一个矩形并入（A）">
          ＋ 添加形状
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => {
            const count = Object.values(elements).filter((e) => e.kind === "zone").length;
            add(zoneFromRoom(el, count));
            toast.success("已按房间轮廓创建部门区域");
          }}
        >
          设为部门区域
        </Button>
      </div>
    </Section>
  );
}

// ── 门 ────────────────────────────────────────────────────────────────────────
function DoorProps({ el, set }: { el: Extract<MapElement, { kind: "door" }>; set: (changes: Partial<Extract<MapElement, { kind: "door" }>>) => void }) {
  const elements = useEditorStore((s) => s.elements);
  const geom = resolveDoor(el, (id) => elements[id]);
  const hostLen = geom ? Math.hypot(geom.b[0] - geom.a[0], geom.b[1] - geom.a[1]) : 0;
  void hostLen;
  return (
    <Section title="门">
      <Row label="宽度">
        <NumInput value={el.w} min={20} step={10} suffix="cm" onChange={(v) => set({ w: Math.max(20, v) })} />
      </Row>
      <Row label="沿边位置">
        <NumInput value={Math.round(el.offset)} min={0} step={10} suffix="cm" onChange={(v) => set({ offset: Math.max(0, v) })} />
      </Row>
      <Row label="开门方向">
        <div className="flex items-center gap-2">
          <Switch checked={el.swing === "out"} onCheckedChange={(v) => set({ swing: v ? "out" : "in" })} />
          <span className="text-xs text-muted-foreground">{el.swing === "in" ? "向内开（X 切换）" : "向外开（X 切换）"}</span>
        </div>
      </Row>
      <Row label="铰链侧">
        <div className="flex items-center gap-2">
          <Switch checked={el.hinge === "end"} onCheckedChange={(v) => set({ hinge: v ? "end" : "start" })} />
          <span className="text-xs text-muted-foreground">{el.hinge === "start" ? "边起点侧（⇧X 切换）" : "边终点侧（⇧X 切换）"}</span>
        </div>
      </Row>
      <p className="text-[11px] text-muted-foreground">{geom ? `挂在${geom.hostKind === "room" ? "房间" : "墙"}的边上，拖动可沿边滑动` : "宿主边不存在，请删除后重新放置"}</p>
    </Section>
  );
}
