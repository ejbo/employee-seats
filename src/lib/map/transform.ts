/**
 * 元素的通用几何操作（平移 / 矩形 / 顶点 / 旋转 / 中心）。
 * 编辑器画布、批量操作、剪贴板都走这一套，保证房间 / 门 / 区域等特殊形状的行为一致。
 */
import type { MapElement } from "./types";
import { elementBounds, pointsBounds, type Bounds, type DoorBoundsLookup, type RectLike } from "./geometry";
import { findHostEdge } from "./doors";
import { moveRoomVertex } from "./rectilinear";

export interface TransformCtx {
  /** 按 id 取元素（含拖拽中的临时覆盖），门需要它找到宿主边 */
  byId: (id: string) => MapElement | undefined;
  doorGeoms?: DoorBoundsLookup;
}

/** 平移。门没有自己的坐标：把位移投影到宿主边方向变成 offset 的变化。 */
export function translateEl(el: MapElement, dx: number, dy: number, ctx?: TransformCtx): MapElement {
  switch (el.kind) {
    case "wall":
    case "room":
      return { ...el, points: el.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    case "zone":
      return el.geometry.type === "rect"
        ? { ...el, geometry: { ...el.geometry, x: el.geometry.x + dx, y: el.geometry.y + dy } }
        : { ...el, geometry: { ...el.geometry, points: el.geometry.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) } };
    case "door": {
      const host = ctx ? findHostEdge(el.anchor, ctx.byId) : null;
      if (!host) return el;
      const ex = host.b[0] - host.a[0];
      const ey = host.b[1] - host.a[1];
      const len = Math.hypot(ex, ey);
      if (len < 1) return el;
      const along = (dx * ex + dy * ey) / len;
      return { ...el, offset: Math.max(0, Math.min(len - el.w, el.offset + along)) };
    }
    default:
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
}

export function rectOf(el: MapElement): RectLike | null {
  if (el.kind === "seat" || el.kind === "furniture") return { x: el.x, y: el.y, w: el.w, h: el.h, rotation: el.rotation };
  if (el.kind === "zone" && el.geometry.type === "rect") return { x: el.geometry.x, y: el.geometry.y, w: el.geometry.w, h: el.geometry.h, rotation: el.geometry.rotation ?? 0 };
  return null;
}

export function withRect(el: MapElement, r: RectLike): MapElement {
  if (el.kind === "seat" || el.kind === "furniture") return { ...el, x: r.x, y: r.y, w: r.w, h: r.h, rotation: r.rotation };
  if (el.kind === "zone" && el.geometry.type === "rect") return { ...el, geometry: { ...el.geometry, x: r.x, y: r.y, w: r.w, h: r.h, rotation: r.rotation } };
  return el;
}

export function pointsOf(el: MapElement): [number, number][] | null {
  if (el.kind === "wall" || el.kind === "room") return el.points;
  if (el.kind === "zone" && el.geometry.type === "polygon") return el.geometry.points;
  return null;
}

export function withPoints(el: MapElement, points: [number, number][]): MapElement {
  if (el.kind === "wall" || el.kind === "room") return { ...el, points };
  if (el.kind === "zone" && el.geometry.type === "polygon") return { ...el, geometry: { type: "polygon", points } };
  return el;
}

/** 拖动一个顶点到目标位置：房间保持直角（联动相邻两个顶点），其他多边形自由。 */
export function withVertexAt(el: MapElement, index: number, x: number, y: number): MapElement {
  const pts = pointsOf(el);
  if (!pts) return el;
  if (el.kind === "room") {
    const [px, py] = pts[index] ?? [x, y];
    return { ...el, points: moveRoomVertex(pts, index, x - px, y - py) };
  }
  return withPoints(el, pts.map((pt, i) => (i === index ? ([x, y] as [number, number]) : pt)));
}

export function rotationOf(el: MapElement): number | null {
  if (el.kind === "seat" || el.kind === "furniture" || el.kind === "label") return el.rotation;
  if (el.kind === "zone" && el.geometry.type === "rect") return el.geometry.rotation ?? 0;
  return null;
}

export function withRotation(el: MapElement, rotation: number): MapElement {
  if (el.kind === "seat" || el.kind === "furniture" || el.kind === "label") return { ...el, rotation };
  if (el.kind === "zone" && el.geometry.type === "rect") return { ...el, geometry: { ...el.geometry, rotation } };
  return el;
}

export function boundsOf(el: MapElement, ctx?: TransformCtx): Bounds {
  return elementBounds(el, ctx?.doorGeoms);
}

export function centerOf(el: MapElement, ctx?: TransformCtx): { x: number; y: number } {
  const b = boundsOf(el, ctx);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** 一组元素的总包围盒 */
export function groupBounds(els: MapElement[], ctx?: TransformCtx): Bounds | null {
  const pts: [number, number][] = [];
  for (const el of els) {
    const b = boundsOf(el, ctx);
    if (b.w === 0 && b.h === 0 && el.kind === "door") continue;
    pts.push([b.x, b.y], [b.x + b.w, b.y + b.h]);
  }
  return pts.length ? pointsBounds(pts) : null;
}
