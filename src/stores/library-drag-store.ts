import { create } from "zustand";
import type { SeatStyle } from "@/lib/map/types";

/** 从物件库拖到画布上的东西 */
export type LibraryPayload = { kind: "seat"; style: SeatStyle } | { kind: "object"; typeKey: string };

interface LibraryDragState {
  drag: LibraryPayload | null;
  x: number;
  y: number;
  start: (drag: LibraryPayload, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: () => void;
}

export const useLibraryDragStore = create<LibraryDragState>((set) => ({
  drag: null,
  x: 0,
  y: 0,
  start: (drag, x, y) => set({ drag, x, y }),
  move: (x, y) => set({ x, y }),
  end: () => set({ drag: null }),
}));

const THRESHOLD = 5;

/** 卡片 pointerdown 时调用：移动超过阈值才开始拖拽，否则算点击（盖章模式）。 */
export function beginLibraryDrag(e: { button: number; clientX: number; clientY: number }, payload: LibraryPayload): void {
  if (e.button !== 0) return;
  const sx = e.clientX;
  const sy = e.clientY;
  const cleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  const onMove = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > THRESHOLD) {
      cleanup();
      useLibraryDragStore.getState().start(payload, ev.clientX, ev.clientY);
    }
  };
  const onUp = () => cleanup();
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}
