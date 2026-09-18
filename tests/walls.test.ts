import { describe, expect, it } from "vitest";
import { deriveWalls } from "../src/lib/map/walls";
import { rectToPoints } from "../src/lib/map/rectilinear";
import type { DoorEl, MapElement, RoomEl, WallEl } from "../src/lib/map/types";
import { WALL_THICKNESS } from "../src/lib/map/types";

const room = (id: string, x: number, y: number, w: number, h: number, type: RoomEl["type"] = "office"): RoomEl => ({
  kind: "room",
  id,
  name: id,
  type,
  points: rectToPoints(x, y, w, h),
  floorStyle: null,
  wallHeight: null,
});

const T = WALL_THICKNESS;

describe("deriveWalls", () => {
  it("turns one room into four square-cornered pieces", () => {
    const { pieces, pathD } = deriveWalls([room("a", 0, 0, 400, 300)]);
    expect(pieces).toHaveLength(4);
    const top = pieces.find((p) => p.horizontal && p.y === -T / 2)!;
    expect(top).toMatchObject({ x: -T / 2, w: 400 + T, h: T });
    const left = pieces.find((p) => !p.horizontal && p.x === -T / 2)!;
    expect(left).toMatchObject({ y: -T / 2, h: 300 + T, w: T });
    expect(pathD.startsWith("M")).toBe(true);
    expect((pathD.match(/z/g) ?? []).length).toBe(4);
  });

  it("merges the shared wall of two adjacent rooms and collinear runs", () => {
    const { pieces } = deriveWalls([room("a", 0, 0, 400, 300), room("b", 400, 0, 300, 300)]);
    // 上、下各合并成一整条，左、共享、右三条竖墙 → 5 块
    expect(pieces).toHaveLength(5);
    const top = pieces.find((p) => p.horizontal && p.y === -T / 2)!;
    expect(top.w).toBe(700 + T);
    const shared = pieces.filter((p) => !p.horizontal && Math.abs(p.x - (400 - T / 2)) < 0.01);
    expect(shared).toHaveLength(1);
  });

  it("subtracts door openings with flat ends", () => {
    const r = room("a", 0, 0, 400, 300);
    const door: DoorEl = { kind: "door", id: "d", anchor: { kind: "room", roomId: "a", edgeIndex: 0 }, offset: 100, w: 90, swing: "in", hinge: "start" };
    const { pieces, doors } = deriveWalls([r, door]);
    expect(doors).toHaveLength(1);
    const tops = pieces.filter((p) => p.horizontal && p.y === -T / 2).sort((p, q) => p.x - q.x);
    expect(tops).toHaveLength(2);
    expect(tops[0]).toMatchObject({ x: -T / 2, w: 100 + T / 2 }); // 左端方头，开口端平头
    expect(tops[1].x).toBe(190);
    expect(tops[1].x + tops[1].w).toBe(400 + T / 2);
  });

  it("skips corridors and keeps diagonal wall segments separate", () => {
    const wall: WallEl = { kind: "wall", id: "w", thickness: 20, points: [[0, 0], [300, 0], [500, 200]] };
    const els: MapElement[] = [room("c", 0, 0, 400, 300, "corridor"), wall];
    const { pieces, diagonals } = deriveWalls(els);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ x: -10, y: -10, w: 320, h: 20, thickness: 20 });
    expect(diagonals).toHaveLength(1);
    expect(diagonals[0].a).toEqual([300, 0]);
  });

  it("keeps walls of different thickness on the same line as separate pieces", () => {
    const wall: WallEl = { kind: "wall", id: "w", thickness: 24, points: [[0, 0], [400, 0]] };
    const { pieces } = deriveWalls([room("a", 0, 0, 400, 300), wall]);
    const tops = pieces.filter((p) => p.horizontal && p.y < 0);
    expect(tops).toHaveLength(2);
  });
});
