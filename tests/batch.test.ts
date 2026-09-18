import { describe, expect, it } from "vitest";
import { alignElements, distributeElements, duplicateElements, flipGroup, rotateGroup } from "../src/lib/map/batch";
import { clusterRows, renumberSeats } from "../src/lib/map/renumber";
import { rectToPoints } from "../src/lib/map/rectilinear";
import { resolveDoor } from "../src/lib/map/doors";
import type { DoorEl, MapElement, RoomEl, SeatEl } from "../src/lib/map/types";

const seat = (id: string, x: number, y: number, extra: Partial<SeatEl> = {}): SeatEl => ({ kind: "seat", id, code: id, x, y, w: 120, h: 60, rotation: 0, zoneId: null, status: "ACTIVE", note: "", employeeId: null, style: "desk-basic", ...extra });
const room = (id: string, x: number, y: number, w: number, h: number): RoomEl => ({ kind: "room", id, name: id, type: "office", points: rectToPoints(x, y, w, h), floorStyle: null, wallHeight: null });

describe("batch", () => {
  it("aligns lefts and distributes horizontally", () => {
    const els = [seat("a", 0, 0), seat("b", 300, 100), seat("c", 1000, 200)];
    const left = alignElements(els, "left") as SeatEl[];
    expect(left.map((s) => s.x)).toEqual([0, 0, 0]);
    const dist = distributeElements(els, "x") as SeatEl[];
    const xs = dist.sort((p, q) => p.x - q.x).map((s) => s.x);
    // 首尾不动：0 与 1000；中间等间距 → gap = (1120 − 360) / 2 = 380 → b.x = 120 + 380 = 500
    expect(xs).toEqual([0, 500, 1000]);
  });

  it("rotates a group by 90° around its centre and keeps doors on their room", () => {
    const r = room("r", 0, 0, 400, 200);
    const door: DoorEl = { kind: "door", id: "d", anchor: { kind: "room", roomId: "r", edgeIndex: 0 }, offset: 50, w: 90, swing: "in", hinge: "start" };
    const s = seat("s", 20, 20);
    const out = rotateGroup([r, door, s], 90);
    const r2 = out.find((e) => e.id === "r") as RoomEl;
    const d2 = out.find((e) => e.id === "d") as DoorEl;
    const s2 = out.find((e) => e.id === "s") as SeatEl;
    // 包围盒中心 (200,100)：房间变成 200×400，仍以 (200,100) 为中心
    expect(r2.points.length).toBe(4);
    const xs = r2.points.map((p) => p[0]);
    const ys = r2.points.map((p) => p[1]);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([100, 300, -100, 300]);
    expect(s2.rotation).toBe(90);
    // 门：原来在顶边 (x 50..140, y 0)，旋转后在右边 x=300
    const geom = resolveDoor(d2, (id) => (id === "r" ? r2 : undefined))!;
    expect(geom.a[0]).toBe(300);
    expect(geom.b[0]).toBe(300);
  });

  it("mirrors L desks and toggles object flip", () => {
    const l = seat("l", 0, 0, { style: "desk-l" });
    const f: MapElement = { kind: "furniture", id: "f", typeKey: "sofa-2", typeId: null, x: 300, y: 0, w: 160, h: 85, rotation: 30, name: "", flip: false };
    const out = flipGroup([l, f], "x");
    expect((out.find((e) => e.id === "l") as SeatEl).style).toBe("desk-l-left");
    const f2 = out.find((e) => e.id === "f") as Extract<MapElement, { kind: "furniture" }>;
    expect(f2.flip).toBe(true);
    expect(f2.rotation).toBe(330);
    // 左右互换：l 原来在左，现在在右
    expect((out.find((e) => e.id === "l") as SeatEl).x).toBeGreaterThan(f2.x);
  });

  it("duplicates with fresh ids, new codes and doors re-homed", () => {
    const r = room("r", 0, 0, 400, 200);
    const door: DoorEl = { kind: "door", id: "d", anchor: { kind: "room", roomId: "r", edgeIndex: 0 }, offset: 50, w: 90, swing: "in", hinge: "start" };
    const s = seat("S01", 20, 20, { employeeId: "emp" });
    const out = duplicateElements([r, door, s], 40, 40, new Set(["S01", "S02"]));
    expect(out).toHaveLength(3);
    const s2 = out.find((e) => e.kind === "seat") as SeatEl;
    expect(s2.code).toBe("S03");
    expect(s2.employeeId).toBeNull();
    expect(s2.id).not.toBe("S01");
    const d2 = out.find((e) => e.kind === "door") as DoorEl;
    const r2 = out.find((e) => e.kind === "room") as RoomEl;
    expect(d2.anchor).toMatchObject({ kind: "room", roomId: r2.id });
    // 门单独复制则被丢弃
    expect(duplicateElements([door], 0, 0, new Set())).toHaveLength(0);
  });
});

describe("renumber", () => {
  const grid = [seat("a", 0, 0), seat("b", 140, 5), seat("c", 280, 0), seat("d", 0, 100), seat("e", 140, 100)];
  it("clusters rows by y and numbers left-to-right, top-to-bottom", () => {
    expect(clusterRows(grid).map((r) => r.map((s) => s.id))).toEqual([["a", "b", "c"], ["d", "e"]]);
    const { codes, conflicts } = renumberSeats(grid, { prefix: "A", start: 1, pad: 2, order: "rows", rowLetters: false });
    expect([...codes.values()]).toEqual(["A01", "A02", "A03", "A04", "A05"]);
    expect(conflicts).toEqual([]);
  });
  it("snakes odd rows and supports row letters", () => {
    const snake = renumberSeats(grid, { prefix: "", start: 1, pad: 1, order: "snake", rowLetters: false });
    expect(snake.codes.get("e")).toBe("4");
    expect(snake.codes.get("d")).toBe("5");
    const letters = renumberSeats(grid, { prefix: "", start: 1, pad: 2, order: "rows", rowLetters: true });
    expect(letters.codes.get("c")).toBe("A03");
    expect(letters.codes.get("d")).toBe("B01");
  });
  it("reports conflicts with codes used elsewhere", () => {
    const { conflicts } = renumberSeats(grid.slice(0, 2), { prefix: "S", start: 1, pad: 2, order: "rows", rowLetters: false }, ["S02"]);
    expect(conflicts).toEqual(["S02"]);
  });
});
