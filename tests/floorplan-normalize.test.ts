import { describe, expect, it } from "vitest";
import { normalizeRecognized, rectilinearize, recognizedSchema, toFloorElements } from "../src/lib/ai/floorplan";

describe("floorplan normalize", () => {
  it("straightens nearly axis-aligned edges", () => {
    const pts = rectilinearize([[0, 2], [300, 0], [302, 200], [1, 198]]);
    expect(pts.length).toBe(4);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
    }
  });

  it("parses lenient model output and drops tiny rooms", () => {
    const parsed = recognizedSchema.parse({
      rooms: [
        { name: "会议室", type: "meeting", polygon: [[100, 100], [400, 102], [401, 300], [99, 299]] },
        { name: "点", type: "weird", polygon: [[0, 0], [1, 0], [1, 1]] },
      ],
      doors: [{ x: 250, y: 100 }],
    });
    expect(parsed.rooms[1].type).toBe("other");
    const norm = normalizeRecognized(parsed);
    expect(norm.rooms).toHaveLength(1);
  });

  it("converts to floor elements with anchored doors and floor size", () => {
    const r = normalizeRecognized(
      recognizedSchema.parse({
        outline: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]],
        rooms: [{ name: "A", type: "office", polygon: [[100, 100], [500, 100], [500, 500], [100, 500]] }],
        doors: [{ x: 300, y: 100 }, { x: 900, y: 900 }],
      }),
    );
    // 1000 单位 = 20 m → 2 cm / 单位；正方形图
    const g = toFloorElements(r, { cmPerUnit: 2, aspect: 1, gridSize: 10 });
    const room = g.elements.find((e) => e.kind === "room")!;
    expect(room.kind === "room" && room.points).toEqual([[200, 200], [1000, 200], [1000, 1000], [200, 1000]]);
    const doors = g.elements.filter((e) => e.kind === "door");
    expect(doors).toHaveLength(1);
    expect(g.skippedDoors).toBe(1);
    expect(g.width).toBe(2100);
    expect(g.height).toBe(2100);
  });
});
