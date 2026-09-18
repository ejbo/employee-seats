import { describe, expect, it } from "vitest";
import { elementsInRoom, overlappingRooms, reanchorDoors } from "../src/lib/map/rooms";
import { hostEdges } from "../src/lib/map/doors";
import { rectToPoints, unionRectilinear } from "../src/lib/map/rectilinear";
import type { DoorEl, MapElement, RoomEl, SeatEl } from "../src/lib/map/types";

const room = (id: string, x: number, y: number, w: number, h: number): RoomEl => ({ kind: "room", id, name: id, type: "office", points: rectToPoints(x, y, w, h), floorStyle: null, wallHeight: null });
const seat = (id: string, x: number, y: number): SeatEl => ({ kind: "seat", id, code: id, x, y, w: 120, h: 60, rotation: 0, zoneId: null, status: "ACTIVE", note: "", employeeId: null, style: "desk-basic" });

describe("rooms", () => {
  it("collects elements whose center lies inside the room", () => {
    const r = room("a", 0, 0, 400, 300);
    const inside = seat("s1", 100, 100);
    const straddling = seat("s2", 350, 100); // 中心 410 → 在外
    const outside = seat("s3", 600, 100);
    const label: MapElement = { kind: "label", id: "l", x: 50, y: 50, rotation: 0, text: "x", fontSize: 20, color: null };
    expect(elementsInRoom(r, [inside, straddling, outside, label, r]).map((e) => e.id)).toEqual(["s1", "l"]);
  });

  it("reports interior overlaps but not shared edges", () => {
    const rooms = [room("a", 0, 0, 400, 300), room("b", 400, 0, 300, 300)];
    expect(overlappingRooms(rectToPoints(700, 0, 100, 100), rooms)).toEqual([]);
    expect(overlappingRooms(rectToPoints(300, 100, 200, 100), rooms)).toEqual(["a", "b"]);
    expect(overlappingRooms(rectToPoints(0, 0, 400, 300), rooms, "a")).toEqual([]);
  });

  it("re-anchors doors after a union changes the edge indices", () => {
    const before = room("a", 0, 0, 400, 300);
    // 右边（edge 1）的门
    const door: DoorEl = { kind: "door", id: "d", anchor: { kind: "room", roomId: "a", edgeIndex: 1 }, offset: 100, w: 90, swing: "in", hinge: "start" };
    const merged = unionRectilinear(before.points, rectToPoints(0, 300, 200, 200))!;
    const after: RoomEl = { ...before, points: merged };
    const { doors, removed } = reanchorDoors(before, after, [door], () => undefined);
    expect(removed).toEqual([]);
    expect(doors[0].anchor).toMatchObject({ kind: "room", roomId: "a" });
    // 仍在 x=400 的那条边上，offset 不变
    const edge = hostEdges([after]).find((e) => e.anchor.kind === "room" && e.anchor.edgeIndex === (doors[0].anchor as { edgeIndex: number }).edgeIndex)!;
    expect(edge.a[0]).toBe(400);
    expect(edge.b[0]).toBe(400);
    expect(doors[0].offset).toBe(100);
  });

  it("drops a door whose edge disappeared", () => {
    const before = room("a", 0, 0, 400, 300);
    const door: DoorEl = { kind: "door", id: "d", anchor: { kind: "room", roomId: "a", edgeIndex: 2 }, offset: 10, w: 90, swing: "in", hinge: "start" };
    const after = room("a", 0, 0, 400, 100); // 底边从 y=300 移到 y=100
    const { doors, removed } = reanchorDoors(before, after, [door], () => undefined);
    expect(doors).toEqual([]);
    expect(removed).toEqual(["d"]);
  });
});
