/**
 * 房间相关的纯函数：房间内的元素、重叠检查、形状变化后门的重新锚定、房间 → 部门区域。
 */
import type { DoorEl, MapElement, RoomEl, ZoneEl } from "./types";
import { hostEdges, nearestHostEdge, resolveDoor } from "./doors";
import { pointInPolygon, roomsOverlap, type Pt } from "./rectilinear";
import { centerOf } from "./transform";

/** 中心点落在房间内的座位 / 物件 / 文字（不含房间、墙、门、区域）。 */
export function elementsInRoom(room: RoomEl, elements: Iterable<MapElement>): MapElement[] {
  const out: MapElement[] = [];
  for (const el of elements) {
    if (el.kind !== "seat" && el.kind !== "furniture" && el.kind !== "label") continue;
    const c = centerOf(el);
    if (pointInPolygon([c.x, c.y], room.points)) out.push(el);
  }
  return out;
}

/** 与 points 内部相交的其他房间 id（共享边不算）。 */
export function overlappingRooms(points: Pt[], rooms: Iterable<RoomEl>, excludeId?: string): string[] {
  const out: string[] = [];
  for (const r of rooms) {
    if (r.id === excludeId) continue;
    if (roomsOverlap(points, r.points)) out.push(r.id);
  }
  return out;
}

/**
 * 房间形状变了（顶点数可能变化）之后，把挂在它边上的门按原世界位置重新吸到新边上；
 * 找不到 60cm 内的新边就删掉这扇门。返回 { doors: 更新后的门, removed: 被删的门 id }。
 */
export function reanchorDoors(before: RoomEl, after: RoomEl, doors: DoorEl[], byId: (id: string) => MapElement | undefined): { doors: DoorEl[]; removed: string[] } {
  const edges = hostEdges([after]);
  const out: DoorEl[] = [];
  const removed: string[] = [];
  for (const d of doors) {
    if (d.anchor.kind !== "room" || d.anchor.roomId !== before.id) {
      out.push(d);
      continue;
    }
    const geom = resolveDoor(d, (id) => (id === before.id ? before : byId(id)));
    if (!geom) {
      removed.push(d.id);
      continue;
    }
    const mid: Pt = [(geom.a[0] + geom.b[0]) / 2, (geom.a[1] + geom.b[1]) / 2];
    const hit = nearestHostEdge(mid, edges, 60, d.w);
    if (!hit) {
      removed.push(d.id);
      continue;
    }
    out.push({ ...d, anchor: hit.edge.anchor, offset: hit.offset });
  }
  return { doors: out, removed };
}

/** 用房间轮廓建一个部门区域。 */
export function zoneFromRoom(room: RoomEl, sortOrder: number): ZoneEl {
  return {
    kind: "zone",
    id: crypto.randomUUID(),
    name: room.name || "区域",
    departmentId: null,
    color: null,
    geometry: { type: "polygon", points: room.points.map((p) => [...p] as Pt) },
    sortOrder,
  };
}
