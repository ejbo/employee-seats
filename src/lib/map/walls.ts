/**
 * 墙派生：房间边界（走廊除外）+ 独立墙段 → 合并成一组轴对齐墙块，再按门减去开口。
 * 相邻房间共享的边只出现一次；原始端头方头（+t/2，自然形成直角接头），门开口端头平头。
 * 非轴对齐的独立墙段保留为 diagonals，单独描边。
 */
import type { MapElement } from "./types";
import { WALL_THICKNESS } from "./types";
import { resolveDoor, type DoorGeom } from "./doors";
import { roomEdges, type Pt } from "./rectilinear";

const EPS = 0.5;

export interface WallPiece {
  x: number;
  y: number;
  w: number;
  h: number;
  horizontal: boolean;
  thickness: number;
}

export interface DiagonalWall {
  id: string;
  a: Pt;
  b: Pt;
  thickness: number;
}

export interface DerivedWalls {
  pieces: WallPiece[];
  diagonals: DiagonalWall[];
  doors: DoorGeom[];
  /** 全部轴对齐墙块拼成的一条 SVG path（nonzero 填充即为并集） */
  pathD: string;
}

interface Interval {
  s: number;
  e: number;
  /** 端头是门开口（平头）还是原始端头（方头） */
  openS: boolean;
  openE: boolean;
}

interface Group {
  horizontal: boolean;
  line: number;
  t: number;
  intervals: Interval[];
}

function groupKey(horizontal: boolean, line: number, t: number): string {
  return `${horizontal ? "h" : "v"}:${Math.round(line)}:${Math.round(t)}`;
}

function addSegment(groups: Map<string, Group>, a: Pt, b: Pt, t: number): boolean {
  const horizontal = Math.abs(a[1] - b[1]) <= EPS;
  const vertical = Math.abs(a[0] - b[0]) <= EPS;
  if (!horizontal && !vertical) return false;
  if (horizontal && vertical) return true; // 零长度
  const line = horizontal ? a[1] : a[0];
  const s = horizontal ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]);
  const e = horizontal ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
  const key = groupKey(horizontal, line, t);
  let g = groups.get(key);
  if (!g) {
    g = { horizontal, line, t, intervals: [] };
    groups.set(key, g);
  }
  g.intervals.push({ s, e, openS: false, openE: false });
  return true;
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((p, q) => p.s - q.s);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.s <= last.e + EPS) {
      if (iv.e > last.e) {
        last.e = iv.e;
        last.openE = iv.openE;
      }
    } else out.push({ ...iv });
  }
  return out;
}

function subtract(list: Interval[], ds: number, de: number): Interval[] {
  const out: Interval[] = [];
  for (const iv of list) {
    if (de <= iv.s + EPS || ds >= iv.e - EPS) {
      out.push(iv);
      continue;
    }
    if (ds - iv.s > 1) out.push({ s: iv.s, e: ds, openS: iv.openS, openE: true });
    if (iv.e - de > 1) out.push({ s: de, e: iv.e, openS: true, openE: iv.openE });
  }
  return out;
}

export function deriveWalls(elements: Iterable<MapElement>): DerivedWalls {
  const list = Array.from(elements);
  const byId = new Map(list.map((el) => [el.id, el] as const));
  const groups = new Map<string, Group>();
  const diagonals: DiagonalWall[] = [];

  for (const el of list) {
    if (el.kind === "room") {
      if (el.type === "corridor") continue;
      for (const e of roomEdges(el.points)) addSegment(groups, e.a, e.b, WALL_THICKNESS);
    } else if (el.kind === "wall") {
      for (let i = 0; i < el.points.length - 1; i++) {
        const a = el.points[i];
        const b = el.points[i + 1];
        if (!addSegment(groups, a, b, el.thickness)) diagonals.push({ id: `${el.id}:${i}`, a, b, thickness: el.thickness });
      }
    }
  }

  const doors: DoorGeom[] = [];
  for (const el of list) {
    if (el.kind !== "door") continue;
    const g = resolveDoor(el, (id) => byId.get(id));
    if (g) doors.push(g);
  }

  for (const g of groups.values()) g.intervals = mergeIntervals(g.intervals);

  for (const d of doors) {
    const horizontal = Math.abs(d.a[1] - d.b[1]) <= EPS;
    const vertical = Math.abs(d.a[0] - d.b[0]) <= EPS;
    if (!horizontal && !vertical) continue;
    const line = horizontal ? d.a[1] : d.a[0];
    const ds = horizontal ? Math.min(d.a[0], d.b[0]) : Math.min(d.a[1], d.b[1]);
    const de = horizontal ? Math.max(d.a[0], d.b[0]) : Math.max(d.a[1], d.b[1]);
    for (const g of groups.values()) {
      if (g.horizontal !== horizontal || Math.abs(g.line - line) > EPS) continue;
      g.intervals = subtract(g.intervals, ds, de);
    }
  }

  const pieces: WallPiece[] = [];
  for (const g of groups.values()) {
    const half = g.t / 2;
    for (const iv of g.intervals) {
      const s = iv.s - (iv.openS ? 0 : half);
      const e = iv.e + (iv.openE ? 0 : half);
      if (e - s <= 0) continue;
      pieces.push(
        g.horizontal
          ? { x: s, y: g.line - half, w: e - s, h: g.t, horizontal: true, thickness: g.t }
          : { x: g.line - half, y: s, w: g.t, h: e - s, horizontal: false, thickness: g.t },
      );
    }
  }
  pieces.sort((p, q) => p.y - q.y || p.x - q.x);

  const pathD = pieces.map((p) => `M${r(p.x)} ${r(p.y)}h${r(p.w)}v${r(p.h)}h${r(-p.w)}z`).join("");
  return { pieces, diagonals, doors, pathD };
}

function r(v: number): number {
  return Math.round(v * 10) / 10;
}
