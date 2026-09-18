/**
 * 填充工位：在房间内最大的内接矩形里按行排桌子，跳过与现有元素相交的格子。纯函数。
 */
import type { MapElement, RoomEl, SeatEl, SeatStyle } from "./types";
import { boundsIntersect, type Bounds } from "./geometry";
import { largestInscribedRect } from "./rectilinear";
import { boundsOf } from "./transform";
import { renumberSeats, type RenumberOptions } from "./renumber";

export interface FillOptions {
  deskW: number;
  deskD: number;
  gapX: number;
  gapY: number;
  /** 离墙净距 */
  margin: number;
  /** rows = 桌子沿 x 排成行；cols = 沿 y 排成列 */
  orientation: "rows" | "cols";
  /** 背靠背成对（0° / 180°），对与对之间留过道 */
  pairFacing: boolean;
  aisle: number;
  style: SeatStyle;
  numbering: RenumberOptions;
}

export const DEFAULT_FILL: FillOptions = {
  deskW: 120,
  deskD: 60,
  gapX: 20,
  gapY: 80,
  margin: 60,
  orientation: "rows",
  pairFacing: true,
  aisle: 120,
  style: "desk-basic",
  numbering: { prefix: "S", start: 1, pad: 2, order: "rows", rowLetters: false },
};

export function fillRoom(room: RoomEl, opts: FillOptions, existing: Iterable<MapElement>, otherCodes: Iterable<string>): { seats: SeatEl[]; conflicts: string[]; area: Bounds } {
  const inner = largestInscribedRect(room.points);
  const area: Bounds = { x: inner.x + opts.margin, y: inner.y + opts.margin, w: inner.w - opts.margin * 2, h: inner.h - opts.margin * 2 };
  const seats: SeatEl[] = [];
  if (area.w <= 0 || area.h <= 0) return { seats, conflicts: [], area };
  const blockers: Bounds[] = [];
  for (const el of existing) {
    if (el.kind === "seat" || el.kind === "furniture") blockers.push(boundsOf(el));
  }
  const rows = opts.orientation === "rows";
  const dw = rows ? opts.deskW : opts.deskD; // 沿主轴的尺寸
  const dd = rows ? opts.deskD : opts.deskW; // 沿次轴的尺寸
  const mainLen = rows ? area.w : area.h;
  const crossLen = rows ? area.h : area.w;
  const perLine = Math.floor((mainLen + opts.gapX) / (dw + opts.gapX));
  if (perLine <= 0) return { seats, conflicts: [], area };
  // 次轴上排「行」：成对时一对 = 2 行贴在一起，对之间 aisle；否则行间 gapY
  const lines: { offset: number; rotation: number }[] = [];
  let cursor = 0;
  while (true) {
    if (opts.pairFacing) {
      if (cursor + dd * 2 > crossLen + 0.01) break;
      lines.push({ offset: cursor, rotation: rows ? 180 : 90 });
      lines.push({ offset: cursor + dd, rotation: rows ? 0 : 270 });
      cursor += dd * 2 + opts.aisle;
    } else {
      if (cursor + dd > crossLen + 0.01) break;
      lines.push({ offset: cursor, rotation: rows ? 0 : 270 });
      cursor += dd + opts.gapY;
    }
  }
  for (const line of lines) {
    for (let i = 0; i < perLine; i++) {
      const main = i * (dw + opts.gapX);
      // 座位以 w×h（不旋转时 w 沿 x）存储；旋转 90/270 时包围盒 w/h 互换
      const vertical = !rows;
      const w = opts.deskW;
      const h = opts.deskD;
      const bx = rows ? area.x + main : area.x + line.offset;
      const by = rows ? area.y + line.offset : area.y + main;
      const bw = vertical ? h : w;
      const bh = vertical ? w : h;
      const box: Bounds = { x: bx, y: by, w: bw, h: bh };
      if (blockers.some((b) => boundsIntersect(box, b))) continue;
      // 存储坐标以未旋转矩形的左上角为准（旋转绕中心）
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      seats.push({
        kind: "seat",
        id: crypto.randomUUID(),
        code: "",
        x: cx - w / 2,
        y: cy - h / 2,
        w,
        h,
        rotation: line.rotation,
        zoneId: null,
        status: "ACTIVE",
        note: "",
        employeeId: null,
        style: opts.style,
      });
    }
  }
  const { codes, conflicts } = renumberSeats(seats, opts.numbering, otherCodes);
  for (const s of seats) s.code = codes.get(s.id) ?? s.code;
  return { seats, conflicts, area };
}
