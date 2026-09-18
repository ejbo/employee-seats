import { describe, expect, it } from "vitest";
import { parseDecor } from "@/lib/map/schema";
import { migrateDecorV1, type FloorDecorV1 } from "@/lib/map/migrate";

const v1: FloorDecorV1 = {
  schemaVersion: 1,
  background: null,
  elements: [
    { kind: "wall", id: "w1", points: [[100, 100], [3900, 100]], thickness: 20 },
    { kind: "furniture", id: "room-meeting", type: "meeting", x: 3100, y: 300, rotation: 0, w: 700, h: 450, name: "会议室 A" },
    { kind: "furniture", id: "printer-1", type: "printer", x: 3600, y: 900, rotation: 0, w: 120, h: 80, name: "打印机" },
    { kind: "door", id: "door-main", x: 2000, y: 100, rotation: 0, w: 90, flip: false },
    { kind: "door", id: "door-lost", x: 500, y: 2500, rotation: 90, w: 90, flip: true },
    { kind: "label", id: "l1", x: 10, y: 10, rotation: 0, text: "入口", fontSize: 32, color: null },
  ],
};

describe("migrateDecorV1", () => {
  it("converts room-ish furniture to rooms and printers to catalog furniture", () => {
    const d = migrateDecorV1(v1);
    expect(d.schemaVersion).toBe(2);
    const room = d.elements.find((e) => e.id === "room-meeting");
    expect(room).toMatchObject({ kind: "room", type: "meeting", name: "会议室 A" });
    expect((room as { points: number[][] }).points).toEqual([[3100, 300], [3800, 300], [3800, 750], [3100, 750]]);
    expect(d.elements.find((e) => e.id === "printer-1")).toMatchObject({ kind: "furniture", typeKey: "printer" });
  });
  it("anchors doors to the nearest wall/room edge and synthesizes a wall for orphans", () => {
    const d = migrateDecorV1(v1);
    const main = d.elements.find((e) => e.id === "door-main");
    expect(main).toMatchObject({ kind: "door", anchor: { kind: "wall", wallId: "w1", segIndex: 0 }, swing: "in" });
    expect((main as { offset: number }).offset).toBe(1900);
    const lost = d.elements.find((e) => e.id === "door-lost");
    expect(lost).toMatchObject({ kind: "door", anchor: { kind: "wall", wallId: "door-lost-wall" }, swing: "out" });
    expect(d.elements.find((e) => e.id === "door-lost-wall")).toMatchObject({ kind: "wall", points: [[500, 2500], [500, 2590]] });
  });
});

describe("parseDecor", () => {
  it("passes v2 through, migrates v1, and falls back to empty on garbage", () => {
    const migrated = parseDecor(v1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.elements.some((e) => e.kind === "room")).toBe(true);
    const again = parseDecor(migrated);
    expect(again).toEqual(migrated);
    expect(parseDecor({ nope: true })).toEqual({ schemaVersion: 2, background: null, elements: [] });
    expect(parseDecor(null)).toEqual({ schemaVersion: 2, background: null, elements: [] });
  });
  it("rejects v2 doors whose host is missing", () => {
    const bad = { schemaVersion: 2, background: null, elements: [{ kind: "door", id: "d", anchor: { kind: "room", roomId: "nope", edgeIndex: 0 }, offset: 0, w: 90, swing: "in", hinge: "start" }] };
    expect(parseDecor(bad).elements).toEqual([]);
  });
});
