import { describe, expect, it } from "vitest";
import { DEFAULT_FILL, fillRoom } from "../src/lib/map/room-fill";
import { rectToPoints } from "../src/lib/map/rectilinear";
import type { RoomEl, SeatEl } from "../src/lib/map/types";

const room = (w: number, h: number): RoomEl => ({ kind: "room", id: "r", name: "r", type: "office", points: rectToPoints(0, 0, w, h), floorStyle: null, wallHeight: null });

describe("fillRoom", () => {
  it("lays out back-to-back pairs with an aisle and numbers by rows", () => {
    // 内接 800×600，减 margin 60 → 680×480；每行 floor((680+20)/140) = 5 张；成对 2×60 = 120 + 120 过道 → 480 里放 2 对 = 4 行
    const { seats, conflicts } = fillRoom(room(800, 600), DEFAULT_FILL, [], []);
    expect(seats).toHaveLength(20);
    expect(conflicts).toEqual([]);
    expect(seats.filter((s) => s.rotation === 180)).toHaveLength(10);
    expect(seats[0].code).toBe("S01");
    expect(seats.every((s) => s.x >= 60 && s.x + s.w <= 740 && s.y >= 60 && s.y + s.h <= 540)).toBe(true);
  });

  it("skips cells blocked by existing elements and continues numbering after taken codes", () => {
    const blocker: SeatEl = { kind: "seat", id: "b", code: "S01", x: 60, y: 60, w: 120, h: 60, rotation: 0, zoneId: null, status: "ACTIVE", note: "", employeeId: null, style: "desk-basic" };
    const { seats, conflicts } = fillRoom(room(800, 600), { ...DEFAULT_FILL, pairFacing: false }, [blocker], ["S01"]);
    expect(seats.some((s) => s.x === 60 && s.y === 60)).toBe(false);
    expect(conflicts).toEqual(["S01"]);
  });

  it("supports column orientation with rotated desks", () => {
    const { seats } = fillRoom(room(400, 800), { ...DEFAULT_FILL, orientation: "cols", pairFacing: false }, [], []);
    expect(seats.length).toBeGreaterThan(0);
    expect(seats.every((s) => s.rotation === 270)).toBe(true);
    // 旋转 270 后包围盒是 60×120：应完全落在 margin 内
    for (const s of seats) {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      expect(cx - s.h / 2).toBeGreaterThanOrEqual(60);
      expect(cy + s.w / 2).toBeLessThanOrEqual(740);
    }
  });
});
