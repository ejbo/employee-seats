/**
 * decor v1 → v2 迁移（纯函数）：房间类家具 → RoomEl；自由门 → 锚定门；printer/custom → typeKey。
 * 什么都不丢：门找不到宿主时，在门下面合成一段墙。
 */
import type { BackgroundImage, DecorElement, DoorEl, FloorDecor, LabelEl, RoomEl, RoomType, WallEl } from "./types";
import { rectToPoints } from "./rectilinear";
import { hostEdges, projectOnSegment } from "./doors";
import { rotatedRectBounds } from "./geometry";

export type FurnitureTypeV1 = "meeting" | "pantry" | "printer" | "elevator" | "stairs" | "restroom" | "storage" | "reception" | "custom";
export interface FurnitureV1 { kind: "furniture"; id: string; x: number; y: number; rotation: number; type: FurnitureTypeV1; w: number; h: number; name: string }
export interface DoorV1 { kind: "door"; id: string; x: number; y: number; rotation: number; w: number; flip: boolean }
export interface FloorDecorV1 {
  schemaVersion: 1;
  background: BackgroundImage | null;
  elements: (WallEl | DoorV1 | LabelEl | FurnitureV1)[];
}

const ROOMISH: Partial<Record<FurnitureTypeV1, RoomType>> = {
  meeting: "meeting",
  pantry: "pantry",
  restroom: "restroom",
  storage: "storage",
  elevator: "elevator",
  stairs: "stairs",
  reception: "reception",
};

const V1_LABEL: Record<FurnitureTypeV1, string> = {
  meeting: "会议室",
  pantry: "茶水间",
  printer: "打印机",
  elevator: "电梯厅",
  stairs: "楼梯",
  restroom: "卫生间",
  storage: "储物间",
  reception: "前台",
  custom: "自定义",
};

/** 把一扇自由门锚到最近的边；没有则合成墙。 */
export function anchorFreeDoor(door: DoorV1, elements: DecorElement[], maxDist = 100): { door: DoorEl; wall?: WallEl } {
  const rad = (door.rotation * Math.PI) / 180;
  const ax = door.x;
  const ay = door.y;
  const bx = ax + Math.cos(rad) * door.w;
  const by = ay + Math.sin(rad) * door.w;
  const mid: [number, number] = [(ax + bx) / 2, (ay + by) / 2];
  const edges = hostEdges(elements);
  let best: { anchor: DoorEl["anchor"]; offset: number; dist: number } | null = null;
  for (const e of edges) {
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    if (len < door.w) continue;
    const { t, dist } = projectOnSegment(mid, e.a, e.b);
    if (dist > maxDist) continue;
    if (!best || dist < best.dist) best = { anchor: e.anchor, offset: Math.max(0, Math.min(len - door.w, t * len - door.w / 2)), dist };
  }
  if (best) {
    return { door: { kind: "door", id: door.id, anchor: best.anchor, offset: Math.round(best.offset), w: door.w, swing: door.flip ? "out" : "in", hinge: "start" } };
  }
  const wall: WallEl = { kind: "wall", id: `${door.id}-wall`, points: [[Math.round(ax), Math.round(ay)], [Math.round(bx), Math.round(by)]], thickness: 12 };
  return { door: { kind: "door", id: door.id, anchor: { kind: "wall", wallId: wall.id, segIndex: 0 }, offset: 0, w: door.w, swing: door.flip ? "out" : "in", hinge: "start" }, wall };
}

export function migrateDecorV1(v1: FloorDecorV1): FloorDecor {
  const elements: DecorElement[] = [];
  const doors: DoorV1[] = [];
  for (const el of v1.elements) {
    switch (el.kind) {
      case "wall":
      case "label":
        elements.push(el);
        break;
      case "door":
        doors.push(el);
        break;
      case "furniture": {
        const roomType = ROOMISH[el.type];
        if (roomType) {
          const b = rotatedRectBounds(el.x, el.y, el.w, el.h, el.rotation);
          const room: RoomEl = {
            kind: "room",
            id: el.id,
            name: el.name || V1_LABEL[el.type],
            type: roomType,
            points: rectToPoints(Math.round(b.x), Math.round(b.y), Math.max(50, Math.round(b.w)), Math.max(50, Math.round(b.h))),
            floorStyle: null,
            wallHeight: null,
          };
          elements.push(room);
        } else {
          elements.push({ kind: "furniture", id: el.id, x: el.x, y: el.y, rotation: el.rotation, typeKey: el.type === "printer" ? "printer" : "custom", typeId: null, w: el.w, h: el.h, name: el.name, flip: false });
        }
        break;
      }
    }
  }
  for (const d of doors) {
    const { door, wall } = anchorFreeDoor(d, elements);
    if (wall) elements.push(wall);
    elements.push(door);
  }
  return { schemaVersion: 2, background: v1.background, elements };
}
