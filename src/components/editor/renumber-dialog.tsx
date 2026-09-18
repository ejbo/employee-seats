"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { SeatEl } from "@/lib/map/types";
import { DEFAULT_RENUMBER, renumberSeats, type RenumberOptions } from "@/lib/map/renumber";
import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ORDER_LABELS: Record<RenumberOptions["order"], string> = { rows: "按行（左→右，上→下）", cols: "按列（上→下，左→右）", snake: "蛇形（隔行反向）", selection: "按选择顺序" };

export function RenumberDialog({ open, onOpenChange, seatIds }: { open: boolean; onOpenChange: (o: boolean) => void; seatIds: string[] }) {
  const elements = useEditorStore((s) => s.elements);
  const patchMany = useEditorStore((s) => s.patchMany);
  const [opts, setOpts] = useState<RenumberOptions>(DEFAULT_RENUMBER);
  const seats = useMemo(() => seatIds.map((id) => elements[id]).filter((e): e is SeatEl => e?.kind === "seat"), [elements, seatIds]);
  const otherCodes = useMemo(() => {
    const ids = new Set(seatIds);
    return Object.values(elements)
      .filter((e): e is SeatEl => e.kind === "seat" && !ids.has(e.id))
      .map((e) => e.code);
  }, [elements, seatIds]);
  const result = useMemo(() => renumberSeats(seats, opts, otherCodes), [seats, opts, otherCodes]);
  const preview = [...result.codes.values()].slice(0, 12);
  const set = (patch: Partial<RenumberOptions>) => setOpts((o) => ({ ...o, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>重新编号 {seats.length} 个座位</DialogTitle>
          <DialogDescription>按位置顺序生成新的座位编号；已落座的员工不受影响。</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">前缀</Label>
            <Input value={opts.prefix} onChange={(e) => set({ prefix: e.target.value })} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">起始号</Label>
            <Input type="number" value={opts.start} onChange={(e) => set({ start: Math.max(0, Number(e.target.value) || 0) })} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">位数</Label>
            <Input type="number" value={opts.pad} onChange={(e) => set({ pad: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} className="h-8 text-xs" />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div>
            <Label className="text-xs">顺序</Label>
            <Select value={opts.order} onValueChange={(v) => set({ order: v as RenumberOptions["order"] })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ORDER_LABELS) as RenumberOptions["order"][]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {ORDER_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-1 text-xs">
            <Switch checked={opts.rowLetters} onCheckedChange={(v) => set({ rowLetters: v })} />
            行用字母
          </label>
        </div>
        <div className="rounded-md bg-muted px-3 py-2 font-mono text-[11px] text-muted-foreground">
          {preview.join("  ")}
          {result.codes.size > preview.length ? " …" : ""}
        </div>
        {result.conflicts.length > 0 && <p className="text-xs text-danger">与其他座位冲突：{result.conflicts.slice(0, 6).join("、")}{result.conflicts.length > 6 ? " …" : ""}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={result.conflicts.length > 0 || seats.length === 0}
            onClick={() => {
              patchMany(seatIds, (el) => (el.kind === "seat" && result.codes.has(el.id) ? { ...el, code: result.codes.get(el.id)! } : el));
              toast.success(`已重新编号 ${result.codes.size} 个座位`);
              onOpenChange(false);
            }}
          >
            应用
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
