import type { LayoutOp } from "@/lib/floors/ops-schema";
import type { BackgroundImage, DecorElement, FloorDecor, MapElement, SeatEl, ZoneEl } from "./types";

/** 编辑器里的一份完整布局快照。 */
export interface LayoutSnapshot {
  elements: Record<string, MapElement>;
  /** 装饰元素的 z 序（只含 wall/door/label/furniture 的 id） */
  order: string[];
  meta: { width: number; height: number; gridSize: number; background: BackgroundImage | null; backgroundKey: string | null };
}

function stableEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function seatsOf(s: LayoutSnapshot): SeatEl[] {
  return Object.values(s.elements).filter((e): e is SeatEl => e.kind === "seat");
}
export function zonesOf(s: LayoutSnapshot): ZoneEl[] {
  return Object.values(s.elements).filter((e): e is ZoneEl => e.kind === "zone");
}
export function decorOf(s: LayoutSnapshot): FloorDecor {
  const elements: DecorElement[] = [];
  for (const id of s.order) {
    const el = s.elements[id];
    if (el && el.kind !== "seat" && el.kind !== "zone") elements.push(el);
  }
  return { schemaVersion: 2, background: s.meta.background, elements };
}

/** 从 lastSaved 到 current 需要的操作（座位/区域按元素级 diff，装饰整体替换）。 */
export function computeLayoutOps(before: LayoutSnapshot, after: LayoutSnapshot): LayoutOp[] {
  const ops: LayoutOp[] = [];

  const zonesBefore = new Map(zonesOf(before).map((z) => [z.id, z]));
  for (const z of zonesOf(after)) {
    const prev = zonesBefore.get(z.id);
    if (!prev || !stableEqual(prev, z)) {
      ops.push({
        type: "zone.upsert",
        zone: { id: z.id, name: z.name, departmentId: z.departmentId, color: z.color, geometry: z.geometry, sortOrder: z.sortOrder },
      });
    }
    zonesBefore.delete(z.id);
  }
  for (const id of zonesBefore.keys()) ops.push({ type: "zone.delete", id });

  const seatsBefore = new Map(seatsOf(before).map((s) => [s.id, s]));
  for (const s of seatsOf(after)) {
    const prev = seatsBefore.get(s.id);
    // employeeId 不是布局的一部分（分配走单独接口），比较时忽略
    if (!prev || !stableEqual({ ...prev, employeeId: null }, { ...s, employeeId: null })) {
      ops.push({
        type: "seat.upsert",
        seat: { id: s.id, code: s.code, x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation, zoneId: s.zoneId, status: s.status, note: s.note, style: s.style },
      });
    }
    seatsBefore.delete(s.id);
  }
  for (const id of seatsBefore.keys()) ops.push({ type: "seat.delete", id });

  const decorBefore = decorOf(before);
  const decorAfter = decorOf(after);
  if (!stableEqual(decorBefore, decorAfter)) ops.push({ type: "decor.set", decor: decorAfter });

  const patch: { width?: number; height?: number; gridSize?: number; backgroundKey?: string | null } = {};
  if (before.meta.width !== after.meta.width) patch.width = after.meta.width;
  if (before.meta.height !== after.meta.height) patch.height = after.meta.height;
  if (before.meta.gridSize !== after.meta.gridSize) patch.gridSize = after.meta.gridSize;
  if (before.meta.backgroundKey !== after.meta.backgroundKey) patch.backgroundKey = after.meta.backgroundKey;
  if (Object.keys(patch).length > 0) ops.push({ type: "floor.patch", patch });

  return ops;
}

export function hasChanges(before: LayoutSnapshot | null, after: LayoutSnapshot): boolean {
  if (!before) return false;
  return computeLayoutOps(before, after).length > 0;
}
