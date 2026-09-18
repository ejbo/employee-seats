"use client";

/**
 * 选区浮动工具条：对齐 / 分布 / 旋转 / 镜像 / 复制 / 删除，房间多「填充工位」「选中房间内元素」「添加形状」。
 * 定位在选区包围盒上方（屏幕坐标），data-ui 不参与画布手势。
 */
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, Copy, FlipHorizontal2, FlipVertical2, Hash, LayoutGrid, RotateCcw, RotateCw, Shapes, SquareDashedMousePointer, Trash2 } from "lucide-react";
import type { AlignMode } from "@/lib/map/batch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface SelectionToolbarActions {
  align: (mode: AlignMode) => void;
  distribute: (axis: "x" | "y") => void;
  rotate: (deg: 90 | -90) => void;
  flip: (axis: "x" | "y") => void;
  duplicate: () => void;
  remove: () => void;
  renumber: () => void;
  fillRoom: () => void;
  selectRoomContents: () => void;
  addShape: () => void;
}

function Btn({ icon: Icon, label, onClick, disabled }: { icon: typeof Copy; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" disabled={disabled} onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent" aria-label={label}>
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function Sep() {
  return <div className="mx-0.5 h-4 w-px bg-border" />;
}

export function SelectionToolbar({ left, top, count, seatCount, roomSelected, actions }: { left: number; top: number; count: number; seatCount: number; roomSelected: boolean; actions: SelectionToolbarActions }) {
  const multi = count > 1;
  return (
    <div data-ui className="absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-border bg-surface/95 p-0.5 shadow-pop backdrop-blur" style={{ left, top: top - 10 }}>
      {multi && (
        <>
          <Btn icon={AlignStartVertical} label="左对齐" onClick={() => actions.align("left")} />
          <Btn icon={AlignCenterVertical} label="水平居中" onClick={() => actions.align("hcenter")} />
          <Btn icon={AlignEndVertical} label="右对齐" onClick={() => actions.align("right")} />
          <Btn icon={AlignStartHorizontal} label="顶对齐" onClick={() => actions.align("top")} />
          <Btn icon={AlignCenterHorizontal} label="垂直居中" onClick={() => actions.align("vcenter")} />
          <Btn icon={AlignEndHorizontal} label="底对齐" onClick={() => actions.align("bottom")} />
          <Sep />
          <Btn icon={AlignHorizontalSpaceBetween} label="水平等距分布" onClick={() => actions.distribute("x")} disabled={count < 3} />
          <Btn icon={AlignVerticalSpaceBetween} label="垂直等距分布" onClick={() => actions.distribute("y")} disabled={count < 3} />
          <Sep />
        </>
      )}
      <Btn icon={RotateCcw} label="逆时针转 90°" onClick={() => actions.rotate(-90)} />
      <Btn icon={RotateCw} label="顺时针转 90°（⇧R）" onClick={() => actions.rotate(90)} />
      <Btn icon={FlipHorizontal2} label="左右镜像" onClick={() => actions.flip("x")} />
      <Btn icon={FlipVertical2} label="上下镜像" onClick={() => actions.flip("y")} />
      <Sep />
      {seatCount > 1 && <Btn icon={Hash} label="重新编号…" onClick={actions.renumber} />}
      {roomSelected && (
        <>
          <Btn icon={LayoutGrid} label="填充工位…" onClick={actions.fillRoom} />
          <Btn icon={SquareDashedMousePointer} label="选中房间内的元素" onClick={actions.selectRoomContents} />
          <Btn icon={Shapes} label="添加形状（A）" onClick={actions.addShape} />
          <Sep />
        </>
      )}
      <Btn icon={Copy} label="复制一份（⌘D）" onClick={actions.duplicate} />
      <Btn icon={Trash2} label="删除（⌫）" onClick={actions.remove} />
    </div>
  );
}
