/**
 * 户型图识别：提示词、模型输出 schema（图片归一化坐标 0–1000）、直角化整理、换算成楼层元素。
 * 纯函数部分（normalize / toFloorElements）可测试；调用模型在 recognizeFloorPlan。
 */
import { z } from "zod";
import type { DoorEl, MapElement, RoomEl, RoomType, WallEl } from "@/lib/map/types";
import { DEFAULT_DOOR_WIDTH } from "@/lib/map/types";
import { normalizeRectilinear, polygonArea, type Pt } from "@/lib/map/rectilinear";
import { hostEdges, nearestHostEdge } from "@/lib/map/doors";

export const ROOM_TYPES: RoomType[] = ["office", "meeting", "pantry", "restroom", "elevator", "stairs", "storage", "reception", "corridor", "other"];

const pt = z.tuple([z.number(), z.number()]);
export const recognizedSchema = z.object({
  outline: z.array(pt).min(3).optional(),
  rooms: z
    .array(
      z.object({
        name: z.string().default(""),
        type: z.enum(ROOM_TYPES).catch("other"),
        polygon: z.array(pt).min(3),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .default([]),
  walls: z.array(z.object({ a: pt, b: pt })).default([]),
  doors: z.array(z.object({ x: z.number(), y: z.number(), width: z.number().optional() })).default([]),
  scaleHints: z.array(z.object({ text: z.string(), from: pt, to: pt, meters: z.number().optional() })).default([]),
  notes: z.string().optional(),
});
export type Recognized = z.infer<typeof recognizedSchema>;

// ── 整理 ────────────────────────────────────────────────────────────────────
/** 把近似水平 / 垂直的边拉直：相邻两点若 |dx| < |dy| 则对齐 x，否则对齐 y（取平均）。 */
export function rectilinearize(points: Pt[], tolerance = 25): Pt[] {
  if (points.length < 3) return points;
  const pts = points.map(([x, y]) => [x, y] as Pt);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = Math.abs(a[0] - b[0]);
      const dy = Math.abs(a[1] - b[1]);
      if (dx <= dy && dx <= tolerance) {
        const x = (a[0] + b[0]) / 2;
        a[0] = x;
        b[0] = x;
      } else if (dy < dx && dy <= tolerance) {
        const y = (a[1] + b[1]) / 2;
        a[1] = y;
        b[1] = y;
      }
    }
  }
  return normalizeRectilinear(pts.map(([x, y]) => [Math.round(x), Math.round(y)] as Pt));
}

export function normalizeRecognized(r: Recognized): Recognized {
  return {
    ...r,
    outline: r.outline ? rectilinearize(r.outline) : undefined,
    rooms: r.rooms
      .map((room) => ({ ...room, polygon: rectilinearize(room.polygon) }))
      .filter((room) => room.polygon.length >= 4 && polygonArea(room.polygon) > 50),
    walls: r.walls.filter((w) => Math.hypot(w.a[0] - w.b[0], w.a[1] - w.b[1]) > 5),
  };
}

// ── 生成楼层元素 ─────────────────────────────────────────────────────────────
export interface GenerateOptions {
  /** 每个归一化单位对应多少 cm（由比例标定得到） */
  cmPerUnit: number;
  /** 图片宽高比（高 / 宽），用来把 y 的归一化换回真实比例 */
  aspect: number;
  /** 楼层网格（吸附顶点） */
  gridSize?: number;
  /** 门宽 cm */
  doorWidth?: number;
}

function toCm(p: Pt, o: GenerateOptions): Pt {
  const g = o.gridSize ?? 10;
  return [Math.round((p[0] * o.cmPerUnit) / g) * g, Math.round((p[1] * o.cmPerUnit * o.aspect) / g) * g];
}

export interface Generated {
  elements: MapElement[];
  width: number;
  height: number;
  skippedDoors: number;
}

export function toFloorElements(r: Recognized, o: GenerateOptions, idPrefix = "ai"): Generated {
  const elements: MapElement[] = [];
  let n = 0;
  const id = (k: string) => `${idPrefix}-${k}-${++n}-${Math.random().toString(36).slice(2, 7)}`;
  const rooms: RoomEl[] = [];
  for (const room of r.rooms) {
    const points = normalizeRectilinear(room.polygon.map((p) => toCm(p, o)));
    if (points.length < 4 || polygonArea(points) < 10000) continue;
    const el: RoomEl = { kind: "room", id: id("room"), name: room.name || "", type: room.type, points, floorStyle: null, wallHeight: null };
    rooms.push(el);
    elements.push(el);
  }
  const walls: WallEl[] = [];
  for (const w of r.walls) {
    const a = toCm(w.a, o);
    const b = toCm(w.b, o);
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 30) continue;
    const el: WallEl = { kind: "wall", id: id("wall"), points: [a, b], thickness: 20 };
    walls.push(el);
    elements.push(el);
  }
  if (r.outline && r.outline.length >= 4 && rooms.length === 0 && walls.length === 0) {
    const pts = r.outline.map((p) => toCm(p, o));
    elements.push({ kind: "wall", id: id("wall"), points: [...pts, pts[0]], thickness: 20 });
  }
  const edges = hostEdges(elements);
  const doorW = o.doorWidth ?? DEFAULT_DOOR_WIDTH;
  let skippedDoors = 0;
  for (const d of r.doors) {
    const c = toCm([d.x, d.y], o);
    const hit = nearestHostEdge(c, edges, 80, doorW);
    if (!hit) {
      skippedDoors++;
      continue;
    }
    const el: DoorEl = { kind: "door", id: id("door"), anchor: hit.edge.anchor, offset: hit.offset, w: doorW, swing: "in", hinge: "start" };
    elements.push(el);
  }
  // 楼层尺寸：外轮廓或全部元素的包围盒 + 1m 边距
  let maxX = 0;
  let maxY = 0;
  const consider = (p: Pt) => {
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  };
  if (r.outline) r.outline.forEach((p) => consider(toCm(p, o)));
  for (const el of elements) {
    if (el.kind === "room" || el.kind === "wall") el.points.forEach(consider);
  }
  return { elements, width: Math.ceil((maxX + 100) / 100) * 100, height: Math.ceil((maxY + 100) / 100) * 100, skippedDoors };
}
