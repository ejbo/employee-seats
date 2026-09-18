import { describe, expect, it } from "vitest";
import { collectCandidates, snapAngle, snapMove, snapValue, WALL_CLEARANCE } from "../src/lib/map/snap";
import { rectToPoints } from "../src/lib/map/rectilinear";
import type { MapElement, RoomEl, SeatEl } from "../src/lib/map/types";
import { WALL_THICKNESS } from "../src/lib/map/types";

const seat = (id: string, x: number, y: number): SeatEl => ({ kind: "seat", id, code: id, x, y, w: 120, h: 60, rotation: 0, zoneId: null, status: "ACTIVE", note: "", employeeId: null, style: "desk-basic" });
const room = (id: string, x: number, y: number, w: number, h: number): RoomEl => ({ kind: "room", id, name: id, type: "office", points: rectToPoints(x, y, w, h), floorStyle: null, wallHeight: null });
const floor = { w: 3000, h: 2000 };

describe("snap", () => {
  it("snaps a dragged desk's left edge onto a neighbour's right edge", () => {
    const a = seat("a", 100, 100);
    const me = seat("me", 500, 300);
    const cands = collectCandidates({ elements: [a, me], excludeIds: new Set(["me"]), floor });
    // 拖到 x=226（a 的右边在 220）：吸到 220
    const r = snapMove({ x: 500, y: 300, w: 120, h: 60 }, -274, 0, cands, 12, 20);
    expect(500 + r.dx).toBe(220);
    expect(r.guides.some((g) => g.axis === "x" && g.value === 220)).toBe(true);
  });

  it("prefers the wall clearance line over a plain edge when both are in range", () => {
    const rm = room("r", 0, 0, 1000, 800);
    const other = seat("o", 1200, 20); // 左边 1200；但墙面净距候选在 1000 - 6 - 5 = 989（室外）与 1011（室内）
    const me = seat("me", 1400, 20);
    const cands = collectCandidates({ elements: [rm, other, me], excludeIds: new Set(["me"]), floor });
    const inner = 1000 - (WALL_THICKNESS / 2 + WALL_CLEARANCE);
    // 目标左边 = 987（离室内墙面 2cm、离房间边线 13cm）
    const r = snapMove({ x: 1400, y: 20, w: 120, h: 60 }, 987 - 1400, 0, cands, 12, 20);
    expect(1400 + r.dx).toBe(inner);
  });

  it("offers equal-spacing candidates along a row", () => {
    const a = seat("a", 0, 0);
    const b = seat("b", 160, 0); // 间距 40
    const me = seat("me", 800, 0);
    const cands = collectCandidates({ elements: [a, b, me], excludeIds: new Set(["me"]), floor, dragged: { x: 800, y: 0, w: 120, h: 60 } });
    const gap = cands.find((c) => c.kind === "gap" && c.axis === "x" && c.value === 320);
    expect(gap?.gap).toBe(40);
    const r = snapMove({ x: 800, y: 0, w: 120, h: 60 }, 325 - 800, 0, cands, 12, 20);
    expect(800 + r.dx).toBe(320);
  });

  it("falls back to the grid when nothing is in range", () => {
    const cands = collectCandidates({ elements: [seat("me", 500, 500)], excludeIds: new Set(["me"]), floor });
    const r = snapMove({ x: 500, y: 500, w: 120, h: 60 }, 33, 47, cands, 12, 20);
    expect(r.dx).toBe(40);
    expect(r.dy).toBe(40);
    expect(r.guides).toEqual([]);
  });

  it("snaps a single edge value and reports a guide", () => {
    const els: MapElement[] = [seat("a", 100, 100)];
    const cands = collectCandidates({ elements: els, excludeIds: new Set(), floor });
    expect(snapValue(224, "x", cands, 12, 20, [0, 0]).value).toBe(220);
    expect(snapValue(233, "x", cands, 12, 20, [0, 0])).toMatchObject({ value: 240, guide: null });
  });

  it("snaps angles to 90° when close, else 15°", () => {
    expect(snapAngle(93)).toBe(90);
    expect(snapAngle(268)).toBe(270);
    expect(snapAngle(38)).toBe(45);
    expect(snapAngle(38, true)).toBe(38);
    expect(snapAngle(-2)).toBe(0);
  });
});
