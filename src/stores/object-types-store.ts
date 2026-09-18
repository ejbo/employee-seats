import { create } from "zustand";
import type { ObjectTypeSummary } from "@/lib/map/types";

/** 自定义物件（ObjectType）的客户端登记表：编辑器加载时从场景灌入，物件库拉取 / 新建后更新。 */
interface ObjectTypesState {
  types: Record<string, ObjectTypeSummary>;
  merge: (list: ObjectTypeSummary[]) => void;
}

export const useObjectTypesStore = create<ObjectTypesState>((set) => ({
  types: {},
  merge: (list) =>
    set((s) => {
      const types = { ...s.types };
      for (const t of list) types[t.id] = t;
      return { types };
    }),
}));
