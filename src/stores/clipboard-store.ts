import { create } from "zustand";
import type { MapElement } from "@/lib/map/types";
import type { Bounds } from "@/lib/map/geometry";

/** 编辑器剪贴板：跨楼层存活（模块级 store），粘贴时由画布重新生成 id / 编号。 */
interface ClipboardState {
  items: MapElement[];
  /** 复制时的整组包围盒（用来把粘贴位置对齐到光标） */
  bounds: Bounds | null;
  fromFloorId: string | null;
  set: (items: MapElement[], bounds: Bounds | null, fromFloorId: string | null) => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  items: [],
  bounds: null,
  fromFloorId: null,
  set: (items, bounds, fromFloorId) => set({ items, bounds, fromFloorId }),
}));
