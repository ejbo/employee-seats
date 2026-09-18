import { describe, expect, it } from "vitest";
import {
  ensureClockwise,
  isClockwise,
  isRectilinear,
  largestInscribedRect,
  moveRoomEdge,
  moveRoomVertex,
  normalizeRectilinear,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  rectToPoints,
  roomEdges,
  roomsOverlap,
  unionRectilinear,
  type Pt,
} from "@/lib/map/rectilinear";

const rect = (x: number, y: number, w: number, h: number) => rectToPoints(x, y, w, h);

describe("basic polygon helpers", () => {
  it("area / centroid / orientation for a rect", () => {
    const r = rect(100, 200, 400, 300);
    expect(polygonArea(r)).toBe(120000);
    expect(polygonCentroid(r)).toEqual([300, 350]);
    expect(isClockwise(r)).toBe(true);
    expect(isClockwise([...r].reverse())).toBe(false);
    expect(ensureClockwise([...r].reverse())).toEqual(r);
  });
  it("point in polygon and rectilinearity", () => {
    const r = rect(0, 0, 100, 100);
    expect(pointInPolygon([50, 50], r)).toBe(true);
    expect(pointInPolygon([150, 50], r)).toBe(false);
    expect(isRectilinear(r)).toBe(true);
    expect(isRectilinear([[0, 0], [100, 10], [100, 100], [0, 100]])).toBe(false);
  });
  it("normalize removes collinear points and duplicates", () => {
    const pts: Pt[] = [[0, 0], [50, 0], [100, 0], [100, 100], [100, 100], [0, 100]];
    expect(normalizeRectilinear(pts)).toEqual(rect(0, 0, 100, 100));
  });
  it("roomEdges inward normal points into the room", () => {
    const e = roomEdges(rect(0, 0, 100, 100));
    expect(e[0].horizontal).toBe(true);
    expect(e[0].inward).toEqual([-0, 1]); // 顶边 → 向下
    expect(e[1].inward).toEqual([-1, 0]); // 右边 → 向左
  });
});

describe("edge / vertex editing", () => {
  it("moves an edge perpendicular and clamps to min length", () => {
    const r = rect(0, 0, 400, 300);
    expect(moveRoomEdge(r, 0, 50)).toEqual([[0, 50], [400, 50], [400, 300], [0, 300]]);
    expect(moveRoomEdge(r, 0, 1000)).toEqual([[0, 250], [400, 250], [400, 300], [0, 300]]);
    expect(moveRoomEdge(r, 1, -100)).toEqual([[0, 0], [300, 0], [300, 300], [0, 300]]);
  });
  it("moves a vertex keeping right angles", () => {
    const r = rect(0, 0, 400, 300);
    const moved = moveRoomVertex(r, 2, 50, 20); // 右下角
    expect(moved).toEqual([[0, 0], [450, 0], [450, 320], [0, 320]]);
    expect(isRectilinear(moved)).toBe(true);
    expect(moveRoomVertex(r, 2, -380, 0)).toEqual(r); // 太短 → 拒绝
  });
});

describe("overlap / union / inscribed rect", () => {
  it("shared edges are not overlap, interiors are", () => {
    expect(roomsOverlap(rect(0, 0, 100, 100), rect(100, 0, 100, 100))).toBe(false);
    expect(roomsOverlap(rect(0, 0, 100, 100), rect(50, 50, 100, 100))).toBe(true);
    expect(roomsOverlap(rect(0, 0, 100, 100), rect(300, 300, 10, 10))).toBe(false);
  });
  it("unions two rects into an L shape", () => {
    const u = unionRectilinear(rect(0, 0, 200, 100), rect(0, 100, 100, 100));
    expect(u).not.toBeNull();
    expect(polygonArea(u!)).toBe(30000);
    expect(u!.length).toBe(6);
    expect(isRectilinear(u!)).toBe(true);
    expect(isClockwise(u!)).toBe(true);
  });
  it("returns null for disjoint rects, corner-touching rects and results with holes", () => {
    expect(unionRectilinear(rect(0, 0, 100, 100), rect(200, 0, 100, 100))).toBeNull();
    expect(unionRectilinear(rect(0, 0, 100, 100), rect(100, 100, 100, 100))).toBeNull();
    const cShape: Pt[] = [[0, 0], [300, 0], [300, 300], [0, 300], [0, 200], [200, 200], [200, 100], [0, 100]];
    // 补满缺口 → 完整正方形
    const filled = unionRectilinear(cShape, rect(0, 100, 200, 100));
    expect(filled).toEqual(rect(0, 0, 300, 300));
    // 只封住缺口左侧 → 中间出现洞 → null
    expect(unionRectilinear(cShape, rect(0, 100, 50, 100))).toBeNull();
  });
  it("largest inscribed rect of an L shape", () => {
    const l: Pt[] = [[0, 0], [300, 0], [300, 100], [100, 100], [100, 300], [0, 300]];
    const r = largestInscribedRect(l);
    expect(r.w * r.h).toBe(30000);
  });
});
