import { describe, expect, it } from "vitest";
import { computeLayoutOps, type LayoutSnapshot } from "@/lib/map/diff";
import type { SeatEl, WallEl, ZoneEl } from "@/lib/map/types";

const seat = (id: string, x = 0): SeatEl => ({ kind: "seat", id, code: id.toUpperCase(), x, y: 0, w: 120, h: 60, rotation: 0, zoneId: null, status: "ACTIVE", note: "", employeeId: null, style: "desk-basic" });
const zone: ZoneEl = { kind: "zone", id: "z1", name: "区域", departmentId: null, color: null, geometry: { type: "rect", x: 0, y: 0, w: 100, h: 100 }, sortOrder: 0 };
const wall: WallEl = { kind: "wall", id: "w1", points: [[0, 0], [100, 0]], thickness: 15 };
const meta = { width: 4000, height: 3000, gridSize: 20, background: null, backgroundKey: null };

const snap = (elements: LayoutSnapshot["elements"], order: string[] = [], m = meta): LayoutSnapshot => ({ elements, order, meta: m });

describe("computeLayoutOps", () => {
  it("emits nothing when unchanged", () => {
    const s = snap({ a: seat("a"), z1: zone, w1: wall }, ["w1"]);
    expect(computeLayoutOps(s, s)).toEqual([]);
  });
  it("detects seat create/update/delete and ignores employeeId", () => {
    const before = snap({ a: seat("a"), b: seat("b") });
    const after = snap({ a: { ...seat("a", 40), employeeId: "emp" }, c: seat("c") });
    const ops = computeLayoutOps(before, after);
    expect(ops.map((o) => o.type).sort()).toEqual(["seat.delete", "seat.upsert", "seat.upsert"]);
    const unchangedEmp = computeLayoutOps(snap({ a: seat("a") }), snap({ a: { ...seat("a"), employeeId: "x" } }));
    expect(unchangedEmp).toEqual([]);
  });
  it("replaces decor as a whole and patches floor meta", () => {
    const before = snap({ w1: wall }, ["w1"]);
    const after = snap({ w1: { ...wall, thickness: 20 } }, ["w1"], { ...meta, gridSize: 50 });
    const ops = computeLayoutOps(before, after);
    expect(ops).toEqual([
      { type: "decor.set", decor: { schemaVersion: 2, background: null, elements: [{ ...wall, thickness: 20 }] } },
      { type: "floor.patch", patch: { gridSize: 50 } },
    ]);
  });
  it("deletes zones that disappeared", () => {
    expect(computeLayoutOps(snap({ z1: zone }), snap({}))).toEqual([{ type: "zone.delete", id: "z1" }]);
  });
});
