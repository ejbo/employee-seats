import { create } from "zustand";

/** 2D / 3D 视图共享的交互状态（悬停、选中、部门高亮、定位请求）。 */
interface ViewState {
  hoveredSeatId: string | null;
  selectedSeatId: string | null;
  highlightDeptId: string | null;
  pulseSeatId: string | null;
  flyTo: { seatId: string; nonce: number } | null;
  setHovered: (id: string | null) => void;
  selectSeat: (id: string | null) => void;
  toggleHighlightDept: (id: string | null) => void;
  requestFlyTo: (seatId: string) => void;
  setPulse: (id: string | null) => void;
  reset: () => void;
}

export const useViewStore = create<ViewState>((set) => ({
  hoveredSeatId: null,
  selectedSeatId: null,
  highlightDeptId: null,
  pulseSeatId: null,
  flyTo: null,
  setHovered: (id) => set({ hoveredSeatId: id }),
  selectSeat: (id) => set({ selectedSeatId: id }),
  toggleHighlightDept: (id) => set((s) => ({ highlightDeptId: s.highlightDeptId === id ? null : id })),
  requestFlyTo: (seatId) => set({ flyTo: { seatId, nonce: Date.now() } }),
  setPulse: (id) => set({ pulseSeatId: id }),
  reset: () => set({ hoveredSeatId: null, selectedSeatId: null, highlightDeptId: null, pulseSeatId: null, flyTo: null }),
}));
