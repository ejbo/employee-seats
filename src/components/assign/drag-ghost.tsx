"use client";

import { useDragStore } from "@/stores/drag-store";

/** 跟随指针的拖拽幽灵（不接收指针事件，所以 elementFromPoint 能看到下面的座位）。 */
export function DragGhost() {
  const drag = useDragStore((s) => s.drag);
  const x = useDragStore((s) => s.x);
  const y = useDragStore((s) => s.y);
  const over = useDragStore((s) => s.overSeatId);
  if (!drag) return null;
  return (
    <div
      className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-xs shadow-pop"
      style={{ left: x + 14, top: y + 14, opacity: over ? 1 : 0.85 }}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: drag.color ?? "#8a8a93" }}>
        {drag.label.slice(0, 1)}
      </span>
      <span className="font-medium">{drag.label}</span>
      {drag.sub && <span className="font-mono text-[10px] text-muted-foreground">{drag.sub}</span>}
    </div>
  );
}
