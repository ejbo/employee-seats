"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { RoomEl, SeatEl, SeatStyle } from "@/lib/map/types";
import { SEAT_STYLE_LABELS } from "@/lib/map/types";
import { DEFAULT_FILL, fillRoom, type FillOptions } from "@/lib/map/room-fill";
import { elementsInRoom } from "@/lib/map/rooms";
import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function Num({ label, value, onChange, min = 0, step = 10 }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} min={min} step={step} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} className="h-8 text-xs" />
    </div>
  );
}

export function FillRoomDialog({ open, onOpenChange, roomId, onPreview }: { open: boolean; onOpenChange: (o: boolean) => void; roomId: string | null; onPreview: (seats: SeatEl[] | null) => void }) {
  const elements = useEditorStore((s) => s.elements);
  const addMany = useEditorStore((s) => s.addMany);
  const [opts, setOpts] = useState<FillOptions>(DEFAULT_FILL);
  const room = roomId ? (elements[roomId] as RoomEl | undefined) : undefined;
  const result = useMemo(() => {
    if (!room || room.kind !== "room") return null;
    const all = Object.values(elements);
    const existing = elementsInRoom(room, all);
    const otherCodes = all.filter((e): e is SeatEl => e.kind === "seat").map((e) => e.code);
    return fillRoom(room, opts, existing, otherCodes);
  }, [elements, opts, room]);
  const seats = open ? (result?.seats ?? null) : null;
  useEffect(() => {
    onPreview(seats);
    return () => onPreview(null);
  }, [onPreview, seats]);
  const set = (patch: Partial<FillOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const setNum = (patch: Partial<FillOptions["numbering"]>) => setOpts((o) => ({ ...o, numbering: { ...o.numbering, ...patch } }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>填充工位：{room?.name || "房间"}</DialogTitle>
          <DialogDescription>在房间内自动排桌子（画布上半透明预览），避开已有元素；确认后才真正添加。</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-3">
          <Num label="桌宽 cm" value={opts.deskW} onChange={(v) => set({ deskW: v })} min={40} />
          <Num label="桌深 cm" value={opts.deskD} onChange={(v) => set({ deskD: v })} min={30} />
          <Num label="横向间距" value={opts.gapX} onChange={(v) => set({ gapX: v })} />
          <Num label="行间距" value={opts.gapY} onChange={(v) => set({ gapY: v })} />
          <Num label="离墙净距" value={opts.margin} onChange={(v) => set({ margin: v })} />
          <Num label="过道宽" value={opts.aisle} onChange={(v) => set({ aisle: v })} />
          <div>
            <Label className="text-xs">方向</Label>
            <Select value={opts.orientation} onValueChange={(v) => set({ orientation: v as FillOptions["orientation"] })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rows">横向成行</SelectItem>
                <SelectItem value="cols">纵向成列</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">桌型</Label>
            <Select value={opts.style} onValueChange={(v) => set({ style: v as SeatStyle })}>
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
          </div>
        </div>
        <div className="grid grid-cols-4 items-end gap-3">
          <label className="col-span-1 flex items-center gap-2 pb-1 text-xs">
            <Switch checked={opts.pairFacing} onCheckedChange={(v) => set({ pairFacing: v })} />
            背靠背成对
          </label>
          <div>
            <Label className="text-xs">编号前缀</Label>
            <Input value={opts.numbering.prefix} onChange={(e) => setNum({ prefix: e.target.value })} className="h-8 text-xs" />
          </div>
          <Num label="起始号" value={opts.numbering.start} onChange={(v) => setNum({ start: v })} step={1} />
          <Num label="位数" value={opts.numbering.pad} onChange={(v) => setNum({ pad: Math.min(5, Math.max(1, v)) })} min={1} step={1} />
        </div>
        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {result ? `将添加 ${result.seats.length} 个座位` : "请选择一个房间"}
          {result && result.seats.length > 0 ? ` · ${result.seats[0].code} … ${result.seats[result.seats.length - 1].code}` : ""}
          {result && result.conflicts.length > 0 ? ` · 编号冲突：${result.conflicts.slice(0, 5).join("、")}` : ""}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!result || result.seats.length === 0 || result.conflicts.length > 0}
            onClick={() => {
              if (!result) return;
              addMany(result.seats);
              toast.success(`已添加 ${result.seats.length} 个座位`);
              onOpenChange(false);
            }}
          >
            添加
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
