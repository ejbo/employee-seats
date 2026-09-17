"use client";

import { useEffect, useRef } from "react";
import { seatIdAtPoint, useDragStore, type DragPayload } from "@/stores/drag-store";

/** 拖拽进行中：跟踪指针、计算悬停座位、松手时回调 onDrop。 */
export function useDragSession(onDrop: (drag: DragPayload, overSeatId: string | null) => void) {
  const active = useDragStore((s) => s.drag !== null);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    if (!active) return;
    const store = useDragStore.getState;
    const onMove = (e: PointerEvent) => store().move(e.clientX, e.clientY, seatIdAtPoint(e.clientX, e.clientY));
    const onUp = (e: PointerEvent) => {
      const d = store().drag;
      const over = seatIdAtPoint(e.clientX, e.clientY);
      store().end();
      if (d) onDropRef.current(d, over);
    };
    const onCancel = () => store().end();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") store().end();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      document.body.style.cursor = prevCursor;
    };
  }, [active]);
}
