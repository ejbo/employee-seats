/**
 * 座位重新编号：按行 / 列 / 蛇形 / 选择顺序生成编号。纯函数。
 */
import type { SeatEl } from "./types";

export type RenumberOrder = "rows" | "cols" | "snake" | "selection";

export interface RenumberOptions {
  prefix: string;
  start: number;
  pad: number;
  order: RenumberOrder;
  /** 行用字母（A01、A02 … B01），列号从 start 起 */
  rowLetters: boolean;
}

export const DEFAULT_RENUMBER: RenumberOptions = { prefix: "S", start: 1, pad: 2, order: "rows", rowLetters: false };

/** 按 y 聚成行（容差取座位高度的一半），行内按 x 排序。 */
export function clusterRows(seats: SeatEl[], axis: "y" | "x" = "y"): SeatEl[][] {
  const main = axis === "y" ? (s: SeatEl) => s.y + s.h / 2 : (s: SeatEl) => s.x + s.w / 2;
  const cross = axis === "y" ? (s: SeatEl) => s.x : (s: SeatEl) => s.y;
  const tol = axis === "y" ? (s: SeatEl) => s.h / 2 : (s: SeatEl) => s.w / 2;
  const sorted = [...seats].sort((a, b) => main(a) - main(b));
  const rows: SeatEl[][] = [];
  let rowKey = 0;
  for (const s of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(main(s) - rowKey) <= tol(s)) last.push(s);
    else {
      rows.push([s]);
      rowKey = main(s);
    }
  }
  for (const r of rows) r.sort((a, b) => cross(a) - cross(b));
  return rows;
}

function letterOf(i: number): string {
  let n = i;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function renumberSeats(seats: SeatEl[], opts: RenumberOptions, otherCodes: Iterable<string> = []): { codes: Map<string, string>; conflicts: string[] } {
  const codes = new Map<string, string>();
  const conflicts: string[] = [];
  const taken = new Set(otherCodes);
  const ids = new Set(seats.map((s) => s.id));
  const sequence: SeatEl[][] = opts.order === "selection" ? [seats] : opts.order === "cols" ? clusterRows(seats, "x") : clusterRows(seats, "y");
  if (opts.order === "snake") sequence.forEach((row, i) => i % 2 === 1 && row.reverse());
  let n = opts.start;
  sequence.forEach((row, ri) => {
    row.forEach((s, ci) => {
      const code = opts.rowLetters ? `${opts.prefix}${letterOf(ri)}${String(opts.start + ci).padStart(opts.pad, "0")}` : `${opts.prefix}${String(n++).padStart(opts.pad, "0")}`;
      if (taken.has(code) || [...codes.values()].includes(code)) conflicts.push(code);
      codes.set(s.id, code);
    });
  });
  void ids;
  return { codes, conflicts };
}
