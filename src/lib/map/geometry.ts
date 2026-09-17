import type { DecorElement, FurnitureEl, MapElement, SeatEl, ZoneEl } from "./types";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Transform {
  x: number;
  y: number;
  k: number;
}

/** 矩形元素的 SVG transform：绕中心旋转。 */
export function rectTransform(x: number, y: number, w: number, h: number, rotation: number): string {
  if (!rotation) return `translate(${x} ${y})`;
  return `translate(${x + w / 2} ${y + h / 2}) rotate(${rotation}) translate(${-w / 2} ${-h / 2})`;
}

export function snap(v: number, grid: number): number {
  return grid > 0 ? Math.round(v / grid) * grid : v;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function pointsBounds(points: [number, number][]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** 旋转矩形的轴对齐包围盒。 */
export function rotatedRectBounds(x: number, y: number, w: number, h: number, rotation: number): Bounds {
  if (!rotation) return { x, y, w, h };
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const bw = w * cos + h * sin;
  const bh = w * sin + h * cos;
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

export function elementBounds(el: MapElement): Bounds {
  switch (el.kind) {
    case "seat":
    case "furniture":
      return rotatedRectBounds(el.x, el.y, el.w, el.h, el.rotation);
    case "door":
      return rotatedRectBounds(el.x, el.y - el.w, el.w, el.w, el.rotation);
    case "label":
      return { x: el.x, y: el.y - el.fontSize, w: el.text.length * el.fontSize, h: el.fontSize * 1.3 };
    case "wall":
      return pointsBounds(el.points);
    case "zone":
      return el.geometry.type === "rect"
        ? rotatedRectBounds(el.geometry.x, el.geometry.y, el.geometry.w, el.geometry.h, el.geometry.rotation ?? 0)
        : pointsBounds(el.geometry.points);
  }
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function boundsContains(outer: Bounds, inner: Bounds): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function boundsCenter(b: Bounds): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** 让 bounds 刚好放进视口（留 padding 像素）。 */
export function fitTransform(bounds: Bounds, viewportW: number, viewportH: number, padding = 40, maxK = 4): Transform {
  const w = Math.max(1, bounds.w);
  const h = Math.max(1, bounds.h);
  const k = clamp(Math.min((viewportW - padding * 2) / w, (viewportH - padding * 2) / h), 0.01, maxK);
  return {
    k,
    x: (viewportW - w * k) / 2 - bounds.x * k,
    y: (viewportH - h * k) / 2 - bounds.y * k,
  };
}

/** 以给定缩放把某点放到视口中心。 */
export function centerTransform(cx: number, cy: number, k: number, viewportW: number, viewportH: number): Transform {
  return { k, x: viewportW / 2 - cx * k, y: viewportH / 2 - cy * k };
}

export function isDecor(el: MapElement): el is DecorElement {
  return el.kind === "wall" || el.kind === "door" || el.kind === "label" || el.kind === "furniture";
}
export function isSeat(el: MapElement): el is SeatEl {
  return el.kind === "seat";
}
export function isZone(el: MapElement): el is ZoneEl {
  return el.kind === "zone";
}
export function isFurniture(el: MapElement): el is FurnitureEl {
  return el.kind === "furniture";
}

/** 姓名显示：中文 ≤ 4 字全显，更长取 3 字 + …；拉丁名取最后一个词。 */
export function shortName(name: string): string {
  const n = name.trim();
  if (!n) return "";
  if (/^[\x00-\x7f\s.'-]+$/.test(n)) {
    const parts = n.split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : n.length > 8 ? `${n.slice(0, 7)}…` : n;
  }
  return n.length > 4 ? `${n.slice(0, 3)}…` : n;
}

// ── 编辑器几何 ────────────────────────────────────────────────────────────────

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

/** 把向量旋转 deg 度。 */
export function rotateVec(dx: number, dy: number, deg: number): [number, number] {
  if (!deg) return [dx, dy];
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [dx * c - dy * s, dx * s + dy * c];
}

/**
 * 用某个把手拖动 (wdx, wdy)（世界坐标增量）后的矩形：在元素自身坐标系里改宽高，
 * 保持对边不动（即使元素是旋转的）。
 */
export function resizeRect(o: RectLike, handle: Handle, wdx: number, wdy: number, minSize = 10, grid = 0): RectLike {
  const [ldx, ldy] = rotateVec(wdx, wdy, -o.rotation);
  let nx = 0;
  let ny = 0;
  let nw = o.w;
  let nh = o.h;
  const sdx = grid ? snap(ldx, grid) : ldx;
  const sdy = grid ? snap(ldy, grid) : ldy;
  if (handle.includes("e")) nw = Math.max(minSize, o.w + sdx);
  if (handle.includes("w")) {
    nw = Math.max(minSize, o.w - sdx);
    nx = o.w - nw;
  }
  if (handle.includes("s")) nh = Math.max(minSize, o.h + sdy);
  if (handle.includes("n")) {
    nh = Math.max(minSize, o.h - sdy);
    ny = o.h - nh;
  }
  const lcx = nx + nw / 2 - o.w / 2;
  const lcy = ny + nh / 2 - o.h / 2;
  const [wcx, wcy] = rotateVec(lcx, lcy, o.rotation);
  const cx = o.x + o.w / 2 + wcx;
  const cy = o.y + o.h / 2 + wcy;
  return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh, rotation: o.rotation };
}

/** 指针相对中心的角度（度），0 = 正上方。 */
export function angleFromCenter(cx: number, cy: number, px: number, py: number): number {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
}

export function normalizeAngle(deg: number): number {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}

/** 下一个可用的座位编号：前缀 + 序号，跳过已存在的。 */
export function nextSeatCode(existing: Set<string>, prefix = "S", pad = 2): string {
  for (let i = 1; i < 10000; i++) {
    const code = `${prefix}${String(i).padStart(pad, "0")}`;
    if (!existing.has(code)) return code;
  }
  return `${prefix}${Date.now()}`;
}
