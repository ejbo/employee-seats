import { describe, expect, it } from "vitest";
import { generatedObjectSchema, projectTopDown, toObjectSpec } from "../src/lib/ai/object-spec-schema";

describe("object spec from model", () => {
  it("parses lenient output and normalizes into a spec", () => {
    const g = generatedObjectSchema.parse({
      name: "沙发",
      category: "seating",
      footprint: ["160", 85],
      height: 85,
      parts: [
        { shape: "rbox", size: [160, 20, 85], pos: [0, 10, 0], color: "$fabric", radius: 4 },
        { shape: "weird", size: [4, 40, 4], pos: [70, -5, 30], color: "not-a-color" },
      ],
    });
    expect(g.parts[1].shape).toBe("box");
    expect(g.parts[1].color).toBe("$desk");
    const spec = toObjectSpec(g, "t");
    expect(spec.footprint).toEqual([160, 85]);
    // 地面以下的部件被抬到地面
    expect(spec.parts[1].pos![1]).toBe(20);
  });

  it("scales oversized parts into the footprint", () => {
    const g = generatedObjectSchema.parse({ name: "桌", category: "table", footprint: [100, 60], height: 75, parts: [{ shape: "box", size: [200, 3, 120], pos: [0, 73.5, 0], color: "$wood" }] });
    const spec = toObjectSpec(g, "t");
    expect(spec.parts[0].size[0]).toBeLessThanOrEqual(115);
  });

  it("projects to top-down shapes sorted by height", () => {
    const spec = toObjectSpec(generatedObjectSchema.parse({ name: "x", category: "office", footprint: [100, 100], height: 100, parts: [{ shape: "cylinder", size: [20, 90, 20], pos: [0, 45, 0], color: "$metal" }, { shape: "box", size: [100, 4, 100], pos: [0, 2, 0], color: "$desk" }] }), "t");
    const shapes = projectTopDown(spec);
    expect(shapes[0].kind).toBe("rect");
    expect(shapes[1]).toMatchObject({ kind: "circle", x: 40, y: 40, w: 20, h: 20 });
  });
});
