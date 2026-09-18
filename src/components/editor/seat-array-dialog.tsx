"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { SeatEl } from "@/lib/map/types";
import { useEditorStore } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Order = "row" | "col" | "snake";

interface Cfg {
  prefix: string;
  start: number;
  pad: number;
  rows: number;
  cols: number;
  w: number;
  h: number;
  gapX: number;
  gapY: number;
  rotation: number;
  order: Order;
  originXm: number;
  originYm: number;
  /** 每行一个字母前缀（A01…A08 / B01…B08）*/
  rowLetters: boolean;
}

const DEFAULT: Cfg = { prefix: "A", start: 1, pad: 2, rows: 2, cols: 8, w: 120, h: 60, gapX: 60, gapY: 80, rotation: 0, order: "row", originXm: 2, originYm: 2, rowLetters: true };

export function generateSeats(cfg: Cfg, existingCodes: Set<string>): { seats: SeatEl[]; conflicts: string[] } {
  const seats: SeatEl[] = [];
  const conflicts: string[] = [];
  const x0 = Math.round(cfg.originXm * 100);
  const y0 = Math.round(cfg.originYm * 100);
  let n = cfg.start;
  const cells: [number, number][] = [];
  if (cfg.order === "col") {
    for (let c = 0; c < cfg.cols; c++) for (let r = 0; r < cfg.rows; r++) cells.push([r, c]);
  } else {
    for (let r = 0; r < cfg.rows; r++) {
      const cs = Array.from({ length: cfg.cols }, (_, c) => c);
      if (cfg.order === "snake" && r % 2 === 1) cs.reverse();
      for (const c of cs) cells.push([r, c]);
    }
  }
  for (const [r, c] of cells) {
    const code = cfg.rowLetters
      ? `${String.fromCharCode(65 + ((cfg.prefix.charCodeAt(0) || 65) - 65 + r))}${String(cfg.start + c).padStart(cfg.pad, "0")}`
      : `${cfg.prefix}${String(n++).padStart(cfg.pad, "0")}`;
    if (existingCodes.has(code) || seats.some((s) => s.code === code)) conflicts.push(code);
    seats.push({
      kind: "seat",
      id: crypto.randomUUID(),
      code,
      x: x0 + c * (cfg.w + cfg.gapX),
      y: y0 + r * (cfg.h + cfg.gapY),
      w: cfg.w,
      h: cfg.h,
      rotation: cfg.rotation,
      zoneId: null,
      status: "ACTIVE",
      note: "",
      employeeId: null,
      style: "desk-basic",
    });
  }
  return { seats, conflicts };
}

export function SeatArrayDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT);
  const elements = useEditorStore((s) => s.elements);
  const addMany = useEditorStore((s) => s.addMany);
  const existing = useMemo(() => new Set(Object.values(elements).filter((e): e is SeatEl => e.kind === "seat").map((e) => e.code)), [elements]);
  const preview = useMemo(() => generateSeats(cfg, existing), [cfg, existing]);

  const num = (k: keyof Cfg, min = 0) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg((c) => ({ ...c, [k]: Math.max(min, Number(e.target.value) || 0) }));

  function apply() {
    if (preview.conflicts.length) {
      toast.error(`编号冲突：${preview.conflicts.slice(0, 5).join("、")}${preview.conflicts.length > 5 ? "…" : ""}`);
      return;
    }
    addMany(preview.seats);
    toast.success(`已生成 ${preview.seats.length} 个工位，已全选，可整体拖动到位`);
    onOpenChange(false);
  }

  const sample = preview.seats.slice(0, 3).map((s) => s.code).join("、");
  const last = preview.seats[preview.seats.length - 1]?.code;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>批量生成工位</DialogTitle>
          <DialogDescription>按行列生成工位并自动编号；生成后处于全选状态，可整体拖到合适位置。</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <Field label="行数">
            <Input type="number" min={1} value={cfg.rows} onChange={num("rows", 1)} />
          </Field>
          <Field label="列数">
            <Input type="number" min={1} value={cfg.cols} onChange={num("cols", 1)} />
          </Field>
          <Field label="编号顺序">
            <Select value={cfg.order} onValueChange={(v) => setCfg((c) => ({ ...c, order: v as Order }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="row">按行</SelectItem>
                <SelectItem value="col">按列</SelectItem>
                <SelectItem value="snake">蛇形</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="编号方式">
            <Select value={cfg.rowLetters ? "letters" : "seq"} onValueChange={(v) => setCfg((c) => ({ ...c, rowLetters: v === "letters" }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="letters">每行一个字母（A01 B01…）</SelectItem>
                <SelectItem value="seq">前缀 + 连续序号</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={cfg.rowLetters ? "起始字母" : "前缀"}>
            <Input value={cfg.prefix} onChange={(e) => setCfg((c) => ({ ...c, prefix: e.target.value.toUpperCase().slice(0, 8) }))} className="font-mono" />
          </Field>
          <Field label="起始序号 / 位数">
            <div className="flex gap-1">
              <Input type="number" min={0} value={cfg.start} onChange={num("start")} className="font-mono" />
              <Input type="number" min={1} max={4} value={cfg.pad} onChange={num("pad", 1)} className="w-14 font-mono" />
            </div>
          </Field>
          <Field label="工位宽 × 高（cm）">
            <div className="flex gap-1">
              <Input type="number" min={20} value={cfg.w} onChange={num("w", 20)} />
              <Input type="number" min={20} value={cfg.h} onChange={num("h", 20)} />
            </div>
          </Field>
          <Field label="横向 / 纵向间距（cm）">
            <div className="flex gap-1">
              <Input type="number" min={0} value={cfg.gapX} onChange={num("gapX")} />
              <Input type="number" min={0} value={cfg.gapY} onChange={num("gapY")} />
            </div>
          </Field>
          <Field label="旋转（°）">
            <Input type="number" value={cfg.rotation} onChange={(e) => setCfg((c) => ({ ...c, rotation: Number(e.target.value) || 0 }))} />
          </Field>
          <Field label="起点 X / Y（m）">
            <div className="flex gap-1">
              <Input type="number" min={0} step={0.5} value={cfg.originXm} onChange={num("originXm")} />
              <Input type="number" min={0} step={0.5} value={cfg.originYm} onChange={num("originYm")} />
            </div>
          </Field>
        </div>
        <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          将生成 <span className="font-mono text-foreground">{preview.seats.length}</span> 个工位：{sample}
          {preview.seats.length > 3 ? ` … ${last}` : ""}
          {preview.conflicts.length > 0 && <span className="ml-2 text-danger">与现有编号冲突：{preview.conflicts.slice(0, 4).join("、")}</span>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={apply} disabled={preview.seats.length === 0 || preview.conflicts.length > 0}>
            生成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
