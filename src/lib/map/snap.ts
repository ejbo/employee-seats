/**
 * 智能吸附：拖动 / 缩放 / 绘制时，把被拖的边、中心吸到其他元素的边 / 中心、房间墙面（含净距）、楼层边界、等间距位置上。
 * 纯函数：手势开始时用 collectCandidates 收集一次候选，每次移动用 snapMove / snapValue 计算。
 */
import type { MapElement } from "./types";
import { WALL_THICKNESS } from "./types";
import { elementBounds, snap, type Bounds } from "./geometry";
import { roomEdges } from "./rectilinear";

export type Axis = "x" | "y";
export type SnapKind = "edge" | "center" | "wall" | "floor" | "gap";

export interface SnapCandidate {
  axis: Axis;
  value: number;
  kind: SnapKind;
  /** 沿另一轴的范围（用来画参考线） */
  from: number;
  to: number;
  /** 命中奖励（cm）：越大越优先 */
  bonus: number;
  /** 等间距候选附带的间距，用来显示徽标 */
  gap?: number;
}

export interface Guide {
  axis: Axis;
  value: number;
  from: number;
  to: number;
  kind: SnapKind;
  gap?: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** 桌子贴墙时留的净距（cm） */
export const WALL_CLEARANCE = 5;
const BONUS: Record<SnapKind, number> = { wall: 6, floor: 6, gap: 4, edge: 3, center: 0 };

export interface CollectOptions {
  elements: Iterable<MapElement>;
  /** 正在拖动的元素（不作为候选） */
  excludeIds: Set<string>;
  floor: { w: number; h: number };
  /** 被拖动的包围盒（用于等间距候选） */
  dragged?: Bounds;
  doorGeoms?: { get(id: string): { a: [number, number]; b: [number, number]; w: number } | undefined };
}

function pushRect(out: SnapCandidate[], b: Bounds, kind: SnapKind) {
  const bonus = BONUS[kind];
  out.push(
    { axis: "x", value: b.x, kind, from: b.y, to: b.y + b.h, bonus },
    { axis: "x", value: b.x + b.w, kind, from: b.y, to: b.y + b.h, bonus },
    { axis: "x", value: b.x + b.w / 2, kind: "center", from: b.y, to: b.y + b.h, bonus: BONUS.center },
    { axis: "y", value: b.y, kind, from: b.x, to: b.x + b.w, bonus },
    { axis: "y", value: b.y + b.h, kind, from: b.x, to: b.x + b.w, bonus },
    { axis: "y", value: b.y + b.h / 2, kind: "center", from: b.x, to: b.x + b.w, bonus: BONUS.center },
  );
}

export function collectCandidates({ elements, excludeIds, floor, dragged, doorGeoms }: CollectOptions): SnapCandidate[] {
  const out: SnapCandidate[] = [];
  const rects: Bounds[] = [];
  for (const el of elements) {
    if (excludeIds.has(el.id) || el.kind === "door" || el.kind === "wall") continue;
    if (el.kind === "room") {
      const t = WALL_THICKNESS / 2;
      for (const e of roomEdges(el.points)) {
        const axis: Axis = e.horizontal ? "y" : "x";
        const line = e.horizontal ? e.a[1] : e.a[0];
        const from = e.horizontal ? Math.min(e.a[0], e.b[0]) : Math.min(e.a[1], e.b[1]);
        const to = e.horizontal ? Math.max(e.a[0], e.b[0]) : Math.max(e.a[1], e.b[1]);
        const inwardSign = e.horizontal ? Math.sign(e.inward[1]) : Math.sign(e.inward[0]);
        // 边线本身（房间对齐房间）+ 室内墙面净距 + 室外墙面净距（桌子贴墙）
        out.push({ axis, value: line, kind: "wall", from, to, bonus: BONUS.wall });
        out.push({ axis, value: line + inwardSign * (t + WALL_CLEARANCE), kind: "wall", from, to, bonus: BONUS.wall });
        out.push({ axis, value: line - inwardSign * (t + WALL_CLEARANCE), kind: "wall", from, to, bonus: BONUS.wall });
      }
      continue;
    }
    const b = elementBounds(el, doorGeoms);
    if (b.w <= 0 && b.h <= 0) continue;
    pushRect(out, b, "edge");
    rects.push(b);
  }
  // 楼层边界
  out.push(
    { axis: "x", value: 0, kind: "floor", from: 0, to: floor.h, bonus: BONUS.floor },
    { axis: "x", value: floor.w, kind: "floor", from: 0, to: floor.h, bonus: BONUS.floor },
    { axis: "y", value: 0, kind: "floor", from: 0, to: floor.w, bonus: BONUS.floor },
    { axis: "y", value: floor.h, kind: "floor", from: 0, to: floor.w, bonus: BONUS.floor },
  );
  // 等间距：同一行（y 范围相交）里相邻元素的间距，复制到下一个位置
  if (dragged) {
    const overlapY = (a: Bounds, b: Bounds) => a.y < b.y + b.h && b.y < a.y + a.h;
    const overlapX = (a: Bounds, b: Bounds) => a.x < b.x + b.w && b.x < a.x + a.w;
    const row = rects.filter((r) => overlapY(r, dragged)).sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < row.length; i++) {
      const a = row[i];
      const b = row[i + 1];
      const gap = b.x - (a.x + a.w);
      if (gap < 0 || gap > 400) continue;
      out.push({ axis: "x", value: b.x + b.w + gap, kind: "gap", from: Math.min(a.y, b.y), to: Math.max(a.y + a.h, b.y + b.h), bonus: BONUS.gap, gap });
      out.push({ axis: "x", value: a.x - gap - dragged.w, kind: "gap", from: Math.min(a.y, b.y), to: Math.max(a.y + a.h, b.y + b.h), bonus: BONUS.gap, gap });
    }
    const col = rects.filter((r) => overlapX(r, dragged)).sort((a, b) => a.y - b.y);
    for (let i = 0; i + 1 < col.length; i++) {
      const a = col[i];
      const b = col[i + 1];
      const gap = b.y - (a.y + a.h);
      if (gap < 0 || gap > 400) continue;
      out.push({ axis: "y", value: b.y + b.h + gap, kind: "gap", from: Math.min(a.x, b.x), to: Math.max(a.x + a.w, b.x + b.w), bonus: BONUS.gap, gap });
      out.push({ axis: "y", value: a.y - gap - dragged.h, kind: "gap", from: Math.min(a.x, b.x), to: Math.max(a.x + a.w, b.x + b.w), bonus: BONUS.gap, gap });
    }
  }
  return out;
}

interface Best {
  delta: number;
  cand: SnapCandidate;
  score: number;
}

/** 在候选里找离 points 最近的一条（阈值内），按 |距离| − 奖励 排序。 */
function bestFor(points: number[], axis: Axis, cands: SnapCandidate[], threshold: number): Best | null {
  let best: Best | null = null;
  for (const c of cands) {
    if (c.axis !== axis) continue;
    for (const p of points) {
      const delta = c.value - p;
      const d = Math.abs(delta);
      if (d > threshold) continue;
      const score = d - c.bonus;
      if (!best || score < best.score) best = { delta, cand: c, score };
    }
  }
  return best;
}

function guideOf(b: Best, extent: [number, number]): Guide {
  return { axis: b.cand.axis, value: b.cand.value, from: Math.min(b.cand.from, extent[0]), to: Math.max(b.cand.to, extent[1]), kind: b.cand.kind, gap: b.cand.gap };
}

/**
 * 整体移动：bounds 为拖动组在手势开始时的包围盒，(dx, dy) 为原始位移。
 * 每个轴取左 / 中 / 右三个点里最优的吸附；没有命中则退回网格。
 */
export function snapMove(bounds: Bounds, dx: number, dy: number, cands: SnapCandidate[], threshold: number, grid: number): SnapResult {
  const moved = { x: bounds.x + dx, y: bounds.y + dy, w: bounds.w, h: bounds.h };
  const bx = bestFor([moved.x, moved.x + moved.w / 2, moved.x + moved.w], "x", cands, threshold);
  const by = bestFor([moved.y, moved.y + moved.h / 2, moved.y + moved.h], "y", cands, threshold);
  const outDx = bx ? dx + bx.delta : snap(dx, grid);
  const outDy = by ? dy + by.delta : snap(dy, grid);
  const finalBox = { x: bounds.x + outDx, y: bounds.y + outDy, w: bounds.w, h: bounds.h };
  const guides: Guide[] = [];
  if (bx) guides.push(guideOf(bx, [finalBox.y, finalBox.y + finalBox.h]));
  if (by) guides.push(guideOf(by, [finalBox.x, finalBox.x + finalBox.w]));
  return { dx: outDx, dy: outDy, guides };
}

/** 单个值（一条边 / 一个点）的吸附：用于缩放、拉边、绘制。 */
export function snapValue(value: number, axis: Axis, cands: SnapCandidate[], threshold: number, grid: number, extent: [number, number]): { value: number; guide: Guide | null } {
  const b = bestFor([value], axis, cands, threshold);
  if (!b) return { value: snap(value, grid), guide: null };
  return { value: b.cand.value, guide: guideOf(b, extent) };
}

/** 点的吸附（两个轴独立）。 */
export function snapPoint(x: number, y: number, cands: SnapCandidate[], threshold: number, grid: number): { x: number; y: number; guides: Guide[] } {
  const rx = snapValue(x, "x", cands, threshold, grid, [y, y]);
  const ry = snapValue(y, "y", cands, threshold, grid, [x, x]);
  return { x: rx.value, y: ry.value, guides: [rx.guide, ry.guide].filter((g): g is Guide => g !== null) };
}

/** 角度吸附：靠近 90° 倍数 4° 内吸到 90°，否则 15° 一档；free 时不吸。 */
export function snapAngle(raw: number, free = false): number {
  const n = ((raw % 360) + 360) % 360;
  if (free) return n;
  const q = Math.round(n / 90) * 90;
  if (Math.abs(n - q) <= 4) return q % 360;
  return (Math.round(n / 15) * 15) % 360;
}
