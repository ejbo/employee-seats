import { create } from "zustand";
import { temporal } from "zundo";
import type { LayoutSnapshot } from "@/lib/map/diff";
import type { FloorScene, MapElement } from "@/lib/map/types";

export type Tool = "select" | "seat" | "zone" | "wall" | "door" | "label" | "furniture" | "image";
export type SaveStatus = "saved" | "dirty" | "saving" | "conflict" | "error";

export interface EditorState extends LayoutSnapshot {
  floorId: string | null;
  baseVersion: number;
  lastSaved: LayoutSnapshot | null;
  tool: Tool;
  selection: string[];
  saveStatus: SaveStatus;

  hydrate: (scene: FloorScene) => void;
  setTool: (tool: Tool) => void;
  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  add: (el: MapElement, options?: { select?: boolean }) => void;
  addMany: (els: MapElement[], options?: { select?: boolean }) => void;
  update: <T extends MapElement>(id: string, changes: Partial<T>) => void;
  patchMany: (ids: string[], fn: (el: MapElement) => MapElement) => void;
  remove: (ids: string[]) => void;
  setMeta: (patch: Partial<LayoutSnapshot["meta"]>) => void;
  reorder: (id: string, direction: "front" | "back") => void;
  /** 保存成功：以“发出去的那份快照”为基准，之后的改动仍算未保存 */
  markSaved: (version: number, snapshot: LayoutSnapshot) => void;
  setSaveStatus: (s: SaveStatus) => void;
  restoreFromServer: (scene: FloorScene) => void;
}

export function snapshotFromScene(scene: FloorScene): LayoutSnapshot {
  const elements: Record<string, MapElement> = {};
  for (const z of scene.zones) elements[z.id] = z;
  for (const s of scene.seats) elements[s.id] = s;
  const order: string[] = [];
  for (const d of scene.decor.elements) {
    elements[d.id] = d;
    order.push(d.id);
  }
  return {
    elements,
    order,
    meta: {
      width: scene.floor.width,
      height: scene.floor.height,
      gridSize: scene.floor.gridSize,
      background: scene.decor.background,
      backgroundKey: scene.floor.backgroundKey,
    },
  };
}

const isDecor = (el: MapElement) => el.kind !== "seat" && el.kind !== "zone";

export const useEditorStore = create<EditorState>()(
  temporal(
    (set, get) => ({
      elements: {},
      order: [],
      meta: { width: 4000, height: 3000, gridSize: 20, background: null, backgroundKey: null },
      floorId: null,
      baseVersion: 1,
      lastSaved: null,
      tool: "select",
      selection: [],
      saveStatus: "saved",

      hydrate: (scene) => {
        const snap = snapshotFromScene(scene);
        set({ ...snap, floorId: scene.floor.id, baseVersion: scene.floor.version, lastSaved: snap, selection: [], tool: "select", saveStatus: "saved" });
        useEditorStore.temporal.getState().clear();
      },
      restoreFromServer: (scene) => {
        const snap = snapshotFromScene(scene);
        set({ ...snap, baseVersion: scene.floor.version, lastSaved: snap, selection: [], saveStatus: "saved" });
        useEditorStore.temporal.getState().clear();
      },
      setTool: (tool) => set({ tool, selection: tool === "select" ? get().selection : [] }),
      select: (ids, additive = false) =>
        set((s) => {
          if (!additive) return { selection: ids };
          const cur = new Set(s.selection);
          for (const id of ids) {
            if (cur.has(id)) cur.delete(id);
            else cur.add(id);
          }
          return { selection: Array.from(cur) };
        }),
      clearSelection: () => set({ selection: [] }),
      add: (el, options) => get().addMany([el], options),
      addMany: (els, options) =>
        set((s) => {
          const elements = { ...s.elements };
          const order = [...s.order];
          for (const el of els) {
            elements[el.id] = el;
            if (isDecor(el) && !order.includes(el.id)) order.push(el.id);
          }
          return { elements, order, saveStatus: "dirty", ...(options?.select === false ? {} : { selection: els.map((e) => e.id) }) };
        }),
      update: (id, changes) =>
        set((s) => {
          const el = s.elements[id];
          if (!el) return {};
          return { elements: { ...s.elements, [id]: { ...el, ...changes } as MapElement }, saveStatus: "dirty" };
        }),
      patchMany: (ids, fn) =>
        set((s) => {
          const elements = { ...s.elements };
          let changed = false;
          for (const id of ids) {
            const el = elements[id];
            if (!el) continue;
            const next = fn(el);
            if (next !== el) {
              elements[id] = next;
              changed = true;
            }
          }
          return changed ? { elements, saveStatus: "dirty" } : {};
        }),
      remove: (ids) =>
        set((s) => {
          const elements = { ...s.elements };
          const removed = new Set<string>();
          for (const id of ids) {
            if (id in elements) {
              delete elements[id];
              removed.add(id);
            }
          }
          if (removed.size === 0) return {};
          // 删除区域时把座位的 zoneId 置空
          for (const [id, el] of Object.entries(elements)) {
            if (el.kind === "seat" && el.zoneId && removed.has(el.zoneId)) elements[id] = { ...el, zoneId: null };
          }
          return {
            elements,
            order: s.order.filter((id) => !removed.has(id)),
            selection: s.selection.filter((id) => !removed.has(id)),
            saveStatus: "dirty",
          };
        }),
      setMeta: (patch) => set((s) => ({ meta: { ...s.meta, ...patch }, saveStatus: "dirty" })),
      reorder: (id, direction) =>
        set((s) => {
          if (!s.order.includes(id)) return {};
          const order = s.order.filter((x) => x !== id);
          if (direction === "front") order.push(id);
          else order.unshift(id);
          return { order, saveStatus: "dirty" };
        }),
      markSaved: (version, snapshot) =>
        set((s) => ({
          baseVersion: version,
          lastSaved: snapshot,
          saveStatus: s.elements === snapshot.elements && s.order === snapshot.order && s.meta === snapshot.meta ? "saved" : "dirty",
        })),
      setSaveStatus: (saveStatus) => set({ saveStatus }),
    }),
    {
      limit: 100,
      partialize: (s) => ({ elements: s.elements, order: s.order, meta: s.meta }),
      equality: (a, b) => a.elements === b.elements && a.order === b.order && a.meta === b.meta,
    },
  ),
);

/** 拖拽期间暂停历史记录，让一次手势只留一步撤销。 */
export function pauseHistory() {
  useEditorStore.temporal.getState().pause();
}
export function resumeHistory() {
  useEditorStore.temporal.getState().resume();
}
export function undo() {
  useEditorStore.temporal.getState().undo();
  useEditorStore.setState({ saveStatus: "dirty" });
}
export function redo() {
  useEditorStore.temporal.getState().redo();
  useEditorStore.setState({ saveStatus: "dirty" });
}
