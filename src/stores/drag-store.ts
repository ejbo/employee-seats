import { create } from "zustand";

/** 正在拖拽的东西：花名册里的员工，或某个座位上的占用者。 */
export interface DragPayload {
  kind: "employee" | "occupant";
  employeeId: string;
  fromSeatId: string | null;
  label: string;
  sub?: string;
  color?: string;
}

interface DragState {
  drag: DragPayload | null;
  x: number;
  y: number;
  overSeatId: string | null;
  start: (drag: DragPayload, x: number, y: number) => void;
  move: (x: number, y: number, overSeatId: string | null) => void;
  end: () => void;
}

export const useDragStore = create<DragState>((set) => ({
  drag: null,
  x: 0,
  y: 0,
  overSeatId: null,
  start: (drag, x, y) => set({ drag, x, y, overSeatId: null }),
  move: (x, y, overSeatId) => set({ x, y, overSeatId }),
  end: () => set({ drag: null, overSeatId: null }),
}));

/** 屏幕坐标下的座位（拖拽幽灵是 pointer-events:none，不会挡住）。 */
export function seatIdAtPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as Element | null;
  return (el?.closest("[data-seat-id]") as HTMLElement | null)?.dataset.seatId ?? null;
}

const THRESHOLD = 5;

/**
 * 在 pointerdown 里调用：指针移动超过阈值才真正开始拖拽（否则就是点击）。
 * 返回一个函数，用来判断这次按下是否已经变成了拖拽。
 */
export function beginDragCandidate(e: { button: number; clientX: number; clientY: number }, payload: DragPayload): () => boolean {
  let started = false;
  if (e.button !== 0) return () => false;
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
      started = true;
      useDragStore.getState().start(payload, ev.clientX, ev.clientY);
    }
  };
  const onUp = () => cleanup();
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => started;
}
