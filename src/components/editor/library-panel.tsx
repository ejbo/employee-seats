"use client";

/**
 * 物件库面板：搜索 + 分类 + 卡片（内嵌俯视符号）。点击卡片进入盖章模式（在画布上点击放置，⇧ 连续），
 * 按住拖到画布上则直接落位。
 */
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Search, Sparkles, X } from "lucide-react";
import { fetcher } from "@/lib/api-client";
import type { ObjectTypeSummary } from "@/lib/map/types";
import { useObjectTypesStore } from "@/stores/object-types-store";
import { ObjectFromPhotoDialog, TopDownPreview } from "./object-from-photo-dialog";
import { CATALOG, CATEGORY_LABELS, SEAT_PRESETS, type ObjectCategory, type ObjectDef } from "@/lib/map/catalog";
import type { SeatStyle } from "@/lib/map/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ObjectGlyph, SeatGlyph } from "@/components/map2d/glyphs";
import { beginLibraryDrag, type LibraryPayload } from "@/stores/library-drag-store";

export type Placement = LibraryPayload;

const CATS: (ObjectCategory | "seat" | "custom")[] = ["seat", "custom", "desk", "seating", "table", "storage", "office", "kitchen", "decor", "partition"];
const CAT_LABELS: Record<ObjectCategory | "seat" | "custom", string> = { seat: "工位", custom: "自定义", ...CATEGORY_LABELS };

function CustomCard({ t, active, onPick }: { t: ObjectTypeSummary; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-muted ${active ? "border-(--info) bg-(--info)/10" : "border-transparent"}`}
      onClick={onPick}
      onPointerDown={(e) => beginLibraryDrag(e, { kind: "object", typeKey: "custom", typeId: t.id })}
      title={`${t.name} · ${t.w}×${t.d}×${t.h} cm`}
    >
      <div className="flex w-16 shrink-0 justify-center">
        <TopDownPreview spec={t.spec} size={44} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{t.name}</div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {t.w}×{t.d} cm
        </div>
      </div>
    </button>
  );
}

function Thumb({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  const pad = 8;
  const k = Math.min(64 / (w + pad * 2), 44 / (h + pad * 2));
  return (
    <svg width={64} height={44} viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`} className="shrink-0" style={{ transform: `scale(${Math.min(1, k * (w + pad * 2) / 64)})` }} preserveAspectRatio="xMidYMid meet">
      {children}
    </svg>
  );
}

function ObjectCard({ def, active, onPick }: { def: ObjectDef; active: boolean; onPick: () => void }) {
  const item = { kind: "furniture" as const, id: `lib-${def.key}`, typeKey: def.key, typeId: null, x: 0, y: 0, w: def.w, h: def.d, rotation: 0, name: "", flip: false };
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-muted ${active ? "border-(--info) bg-(--info)/10" : "border-transparent"}`}
      onClick={onPick}
      onPointerDown={(e) => beginLibraryDrag(e, { kind: "object", typeKey: def.key })}
      title={`${def.name} · ${def.w}×${def.d} cm`}
    >
      <Thumb w={def.w} h={def.d}>
        <ObjectGlyph item={item} def={def} lod={0} k={0.5} />
      </Thumb>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{def.name}</div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {def.w}×{def.d} cm
        </div>
      </div>
    </button>
  );
}

function SeatCard({ style, name, w, h, active, onPick }: { style: SeatStyle; name: string; w: number; h: number; active: boolean; onPick: () => void }) {
  const seat = { kind: "seat" as const, id: `lib-${style}`, code: "", x: 0, y: 0, w, h, rotation: 0, zoneId: null, status: "ACTIVE" as const, note: "", employeeId: null, style };
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-muted ${active ? "border-(--info) bg-(--info)/10" : "border-transparent"}`}
      onClick={onPick}
      onPointerDown={(e) => beginLibraryDrag(e, { kind: "seat", style })}
      title={`${name} · ${w}×${h} cm`}
    >
      <Thumb w={w} h={h}>
        <SeatGlyph seat={seat} employee={null} department={null} lod={0} hovered={false} selected={false} dimmed={false} interactive={false} />
      </Thumb>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{name}</div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {w}×{h} cm
        </div>
      </div>
    </button>
  );
}

export function LibraryPanel({ placement, onPick, onClose }: { placement: Placement | null; onPick: (p: Placement) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ObjectCategory | "seat" | "custom" | "all">("all");
  const [photoOpen, setPhotoOpen] = useState(false);
  const { data: customData, mutate: refetchCustom } = useSWR<{ objects: (ObjectTypeSummary & { key: string })[] }>("/api/objects", fetcher);
  const merge = useObjectTypesStore((s) => s.merge);
  useEffect(() => {
    if (customData?.objects) merge(customData.objects);
  }, [customData, merge]);
  const query = q.trim().toLowerCase();
  const customs = useMemo(() => (customData?.objects ?? []).filter((t) => (cat === "all" || cat === "custom") && (!query || t.name.toLowerCase().includes(query))), [cat, customData, query]);
  const objects = useMemo(
    () => CATALOG.filter((d) => d.key !== "custom" && (cat === "all" || d.category === cat) && (!query || d.name.toLowerCase().includes(query) || d.key.includes(query))),
    [cat, query],
  );
  const seats = useMemo(() => (cat === "all" || cat === "seat" ? SEAT_PRESETS.filter((p) => !query || p.name.toLowerCase().includes(query)) : []), [cat, query]);
  const groups = useMemo(() => {
    const m = new Map<ObjectCategory, ObjectDef[]>();
    for (const d of objects) m.set(d.category, [...(m.get(d.category) ?? []), d]);
    return m;
  }, [objects]);

  return (
    <aside data-ui className="absolute bottom-3 left-16 top-3 z-10 flex w-64 flex-col overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-pop backdrop-blur">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="text-xs font-semibold">物件库</div>
        <div className="ml-auto text-[10px] text-muted-foreground">点击 = 盖章 · 拖动 = 放置</div>
        <Button variant="ghost" size="icon-sm" className="-mr-1 h-6 w-6" onClick={onClose} aria-label="关闭">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="px-3 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索物件…" className="h-8 pl-7 text-xs" />
        </div>
        <div className="thin-scrollbar -mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1">
          {(["all", ...CATS] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${cat === c ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {c === "all" ? "全部" : CAT_LABELS[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="thin-scrollbar flex-1 overflow-y-auto px-2 pb-2">
        {(cat === "all" || cat === "custom") && (
          <div className="mb-1">
            <div className="flex items-center px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-subtle">
              自定义
              <Button variant="ghost" size="sm" className="ml-auto h-6 px-1.5 text-[11px] normal-case tracking-normal" onClick={() => setPhotoOpen(true)}>
                <Sparkles className="h-3 w-3" />
                从照片生成
              </Button>
            </div>
            {customs.length === 0 && <p className="px-2 pb-1 text-[11px] text-muted-foreground">上传一张家具照片，AI 帮你建成 3D 物件。</p>}
            {customs.map((t) => (
              <CustomCard key={t.id} t={t} active={placement?.kind === "object" && placement.typeId === t.id} onPick={() => onPick({ kind: "object", typeKey: "custom", typeId: t.id })} />
            ))}
          </div>
        )}
        {seats.length > 0 && (
          <div className="mb-1">
            <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-subtle">工位</div>
            {seats.map((p) => (
              <SeatCard key={p.style} {...p} active={placement?.kind === "seat" && placement.style === p.style} onPick={() => onPick({ kind: "seat", style: p.style })} />
            ))}
          </div>
        )}
        {[...groups.entries()].map(([c, defs]) => (
          <div key={c} className="mb-1">
            <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-subtle">{CATEGORY_LABELS[c]}</div>
            {defs.map((d) => (
              <ObjectCard key={d.key} def={d} active={placement?.kind === "object" && placement.typeKey === d.key} onPick={() => onPick({ kind: "object", typeKey: d.key })} />
            ))}
          </div>
        ))}
        {seats.length === 0 && objects.length === 0 && customs.length === 0 && <div className="px-2 py-6 text-center text-xs text-muted-foreground">没有匹配的物件</div>}
      </div>
      <ObjectFromPhotoDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        onCreated={(t) => {
          merge([t]);
          void refetchCustom();
          onPick({ kind: "object", typeKey: "custom", typeId: t.id });
        }}
      />
    </aside>
  );
}
