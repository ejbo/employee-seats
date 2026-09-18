/**
 * 直角多边形（房间）几何：面积 / 质心 / 点包含 / 拉边 / 拖角 / 重叠 / 并集 / 最大内接矩形。
 * 屏幕坐标 y 向下；「顺时针」按屏幕方向判断（shoelace 为正）。
 */
import type { Bounds } from "./geometry";

export type Pt = [number, number];

const EPS = 0.5;

export function rectToPoints(x: number, y: number, w: number, h: number): Pt[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

export function signedArea(points: Pt[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polygonArea(points: Pt[]): number {
  return Math.abs(signedArea(points));
}

export function isClockwise(points: Pt[]): boolean {
  return signedArea(points) > 0;
}

export function ensureClockwise(points: Pt[]): Pt[] {
  return isClockwise(points) ? points : [...points].reverse();
}

export function polygonBounds(points: Pt[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function polygonCentroid(points: Pt[]): Pt {
  const a = signedArea(points);
  if (Math.abs(a) < 1e-6) {
    const b = polygonBounds(points);
    return [b.x + b.w / 2, b.y + b.h / 2];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export function pointInPolygon(p: Pt, points: Pt[]): boolean {
  let inside = false;
  const [px, py] = p;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isRectilinear(points: Pt[], eps = EPS): boolean {
  if (points.length < 4) return false;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    if (Math.abs(x1 - x2) > eps && Math.abs(y1 - y2) > eps) return false;
  }
  return true;
}

/** 去重、去共线中点、顺时针；返回新数组。 */
export function normalizeRectilinear(points: Pt[]): Pt[] {
  let pts = points.map(([x, y]) => [Math.round(x), Math.round(y)] as Pt);
  // 去掉连续重复点
  pts = pts.filter((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return !(p[0] === q[0] && p[1] === q[1]);
  });
  // 去掉共线中点（前后同向）
  let changed = true;
  while (changed && pts.length > 4) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const collinear = (a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]);
      if (collinear) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return ensureClockwise(pts);
}

export interface RoomEdge {
  index: number;
  a: Pt;
  b: Pt;
  horizontal: boolean;
  length: number;
  /** 指向房间内部的单位法线（顺时针多边形 = 有向边右侧） */
  inward: Pt;
}

export function roomEdges(points: Pt[]): RoomEdge[] {
  const out: RoomEdge[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    out.push({ index: i, a, b, horizontal: Math.abs(dy) <= EPS, length: len, inward: [-dy / len, dx / len] });
  }
  return out;
}

/**
 * 垂直于边平移第 i 条边（水平边动 y，垂直边动 x）；相邻两条边被夹住，最短 minLen。
 */
export function moveRoomEdge(points: Pt[], i: number, delta: number, minLen = 50): Pt[] {
  const n = points.length;
  const pts = points.map((p) => [...p] as Pt);
  const a = pts[i];
  const b = pts[(i + 1) % n];
  const horizontal = Math.abs(a[1] - b[1]) <= EPS;
  const axis = horizontal ? 1 : 0;
  const prev = pts[(i - 1 + n) % n];
  const next = pts[(i + 2) % n];
  const cur = a[axis];
  let target = cur + delta;
  // 相邻边（与本边垂直）的另一端点：保持方向且长度 ≥ minLen
  for (const other of [prev[axis], next[axis]]) {
    if (cur > other) target = Math.max(target, other + minLen);
    else if (cur < other) target = Math.min(target, other - minLen);
  }
  a[axis] = target;
  b[axis] = target;
  return pts;
}

/** 拖动顶点 i：相邻两点沿共享坐标跟随，保持直角。 */
export function moveRoomVertex(points: Pt[], i: number, dx: number, dy: number, minLen = 50): Pt[] {
  const n = points.length;
  const pts = points.map((p) => [...p] as Pt);
  const cur = pts[i];
  const prev = pts[(i - 1 + n) % n];
  const next = pts[(i + 2 - 1) % n];
  const prevHorizontal = Math.abs(prev[1] - cur[1]) <= EPS;
  // 与 prev 共享的坐标：水平边共享 y，垂直边共享 x
  const nx = cur[0] + dx;
  const ny = cur[1] + dy;
  if (prevHorizontal) {
    prev[1] = ny;
    next[0] = nx;
  } else {
    prev[0] = nx;
    next[1] = ny;
  }
  cur[0] = nx;
  cur[1] = ny;
  // 最短边约束：若某条边过短则退回
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const q = pts[(k + 1) % n];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) < minLen) return points;
  }
  return isRectilinear(pts) ? pts : points;
}

// ── 单元格分解 ───────────────────────────────────────────────────────────────
function coordsOf(polys: Pt[][]): { xs: number[]; ys: number[] } {
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const poly of polys)
    for (const [x, y] of poly) {
      xs.add(x);
      ys.add(y);
    }
  return { xs: Array.from(xs).sort((a, b) => a - b), ys: Array.from(ys).sort((a, b) => a - b) };
}

function insideGrid(poly: Pt[], xs: number[], ys: number[]): boolean[][] {
  const grid: boolean[][] = [];
  for (let iy = 0; iy < ys.length - 1; iy++) {
    const row: boolean[] = [];
    for (let ix = 0; ix < xs.length - 1; ix++) {
      const cx = (xs[ix] + xs[ix + 1]) / 2;
      const cy = (ys[iy] + ys[iy + 1]) / 2;
      row.push(pointInPolygon([cx, cy], poly));
    }
    grid.push(row);
  }
  return grid;
}

/** 两个房间内部是否相交（只共享边不算）。 */
export function roomsOverlap(a: Pt[], b: Pt[]): boolean {
  const ba = polygonBounds(a);
  const bb = polygonBounds(b);
  if (ba.x + ba.w <= bb.x || bb.x + bb.w <= ba.x || ba.y + ba.h <= bb.y || bb.y + bb.h <= ba.y) return false;
  const { xs, ys } = coordsOf([a, b]);
  const ga = insideGrid(a, xs, ys);
  const gb = insideGrid(b, xs, ys);
  for (let iy = 0; iy < ga.length; iy++) for (let ix = 0; ix < ga[iy].length; ix++) if (ga[iy][ix] && gb[iy][ix]) return true;
  return false;
}

const keyOf = (p: Pt) => `${p[0]},${p[1]}`;

/** 由「内部单元格」集合还原一个无洞单多边形边界；不是单一环则返回 null。 */
function boundaryFromCells(inside: (ix: number, iy: number) => boolean, xs: number[], ys: number[]): Pt[] | null {
  const edges = new Map<string, [Pt, Pt]>();
  const add = (p: Pt, q: Pt) => {
    const rk = `${keyOf(q)}|${keyOf(p)}`;
    if (edges.has(rk)) edges.delete(rk);
    else edges.set(`${keyOf(p)}|${keyOf(q)}`, [p, q]);
  };
  for (let iy = 0; iy < ys.length - 1; iy++) {
    for (let ix = 0; ix < xs.length - 1; ix++) {
      if (!inside(ix, iy)) continue;
      const tl: Pt = [xs[ix], ys[iy]];
      const tr: Pt = [xs[ix + 1], ys[iy]];
      const br: Pt = [xs[ix + 1], ys[iy + 1]];
      const bl: Pt = [xs[ix], ys[iy + 1]];
      add(tl, tr);
      add(tr, br);
      add(br, bl);
      add(bl, tl);
    }
  }
  if (edges.size === 0) return null;
  const byStart = new Map<string, [Pt, Pt][]>();
  for (const e of edges.values()) {
    const k = keyOf(e[0]);
    const list = byStart.get(k) ?? [];
    list.push(e);
    byStart.set(k, list);
  }
  // 任一顶点有两条出边 = 环在此处相切（两块只有一点相连）→ 不是单一简单多边形
  for (const list of byStart.values()) if (list.length > 1) return null;
  const first = edges.values().next().value as [Pt, Pt];
  const loop: Pt[] = [first[0]];
  let cur = first;
  let guard = 0;
  while (guard++ < edges.size + 1) {
    const nextList = byStart.get(keyOf(cur[1]));
    if (!nextList || nextList.length === 0) return null;
    cur = nextList[0];
    if (keyOf(cur[0]) === keyOf(first[0])) break;
    loop.push(cur[0]);
  }
  if (loop.length !== edges.size) return null; // 还有别的环（洞 / 不连通）
  return normalizeRectilinear(loop);
}

/** 两个直角多边形的并集；结果必须是一个无洞单多边形，否则 null。 */
export function unionRectilinear(a: Pt[], b: Pt[]): Pt[] | null {
  const { xs, ys } = coordsOf([a, b]);
  const ga = insideGrid(a, xs, ys);
  const gb = insideGrid(b, xs, ys);
  return boundaryFromCells((ix, iy) => ga[iy][ix] || gb[iy][ix], xs, ys);
}

/** 多边形内面积最大的轴对齐矩形（按坐标格粗粒度搜索，房间级别足够）。 */
export function largestInscribedRect(points: Pt[]): Bounds {
  const { xs, ys } = coordsOf([points]);
  const g = insideGrid(points, xs, ys);
  let best: Bounds = { x: xs[0] ?? 0, y: ys[0] ?? 0, w: 0, h: 0 };
  let bestArea = 0;
  const rows = g.length;
  const cols = g[0]?.length ?? 0;
  for (let top = 0; top < rows; top++) {
    const ok = new Array(cols).fill(true) as boolean[];
    for (let bottom = top; bottom < rows; bottom++) {
      for (let c = 0; c < cols; c++) ok[c] = ok[c] && g[bottom][c];
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        if (c < cols && ok[c]) {
          if (start < 0) start = c;
        } else if (start >= 0) {
          const x = xs[start];
          const w = xs[c] - xs[start];
          const y = ys[top];
          const h = ys[bottom + 1] - ys[top];
          if (w * h > bestArea) {
            bestArea = w * h;
            best = { x, y, w, h };
          }
          start = -1;
        }
      }
    }
  }
  return best;
}
