import { z } from "zod";
import { EMPTY_DECOR, type FloorDecor, type ZoneGeometry } from "./types";
import { migrateDecorV1, type FloorDecorV1 } from "./migrate";
import { isRectilinear } from "./rectilinear";

const num = z.number().finite();
const point = z.tuple([num, num]);
const id = z.string().min(1).max(64);

export const zoneGeometrySchema: z.ZodType<ZoneGeometry> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rect"), x: num, y: num, w: num.min(1), h: num.min(1), rotation: num.optional() }),
  z.object({ type: z.literal("polygon"), points: z.array(point).min(3) }),
]);

const placed = { id, x: num, y: num, rotation: num.default(0) };

// ── v2 ──────────────────────────────────────────────────────────────────────
export const roomTypeSchema = z.enum(["office", "meeting", "pantry", "restroom", "elevator", "stairs", "storage", "reception", "corridor", "other"]);
export const floorStyleSchema = z.enum(["plain", "tile", "wood", "carpet"]);
export const seatStyleSchema = z.enum(["desk-basic", "desk-l", "desk-l-left", "bench"]);

export const roomSchema = z.object({
  kind: z.literal("room"),
  id,
  name: z.string().max(64).default(""),
  type: roomTypeSchema.default("office"),
  points: z.array(point).min(4).max(200),
  floorStyle: floorStyleSchema.nullable().default(null),
  wallHeight: num.min(0).max(1000).nullable().default(null),
}).refine((r) => isRectilinear(r.points, 1), { message: "房间必须是直角多边形", path: ["points"] });

export const wallSchema = z.object({
  kind: z.literal("wall"),
  id,
  points: z.array(point).min(2).max(200),
  thickness: num.min(1).max(200).default(15),
});

export const doorAnchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("room"), roomId: id, edgeIndex: z.number().int().min(0) }),
  z.object({ kind: z.literal("wall"), wallId: id, segIndex: z.number().int().min(0) }),
]);

export const doorSchema = z.object({
  kind: z.literal("door"),
  id,
  anchor: doorAnchorSchema,
  offset: num.min(0).default(0),
  w: num.min(20).max(500).default(90),
  swing: z.enum(["in", "out"]).default("in"),
  hinge: z.enum(["start", "end"]).default("start"),
});

export const labelSchema = z.object({
  kind: z.literal("label"),
  ...placed,
  text: z.string().max(200),
  fontSize: num.min(8).max(400).default(28),
  color: z.string().max(32).nullable().default(null),
});

export const furnitureSchema = z.object({
  kind: z.literal("furniture"),
  ...placed,
  typeKey: z.string().min(1).max(64),
  typeId: z.string().max(64).nullable().default(null),
  w: num.min(5).max(5000),
  h: num.min(5).max(5000),
  name: z.string().max(64).default(""),
  flip: z.boolean().default(false),
});

export const decorElementSchema = z.discriminatedUnion("kind", [roomSchema, wallSchema, doorSchema, labelSchema, furnitureSchema]);

export const backgroundSchema = z.object({
  x: num,
  y: num,
  w: num.min(1),
  h: num.min(1),
  opacity: num.min(0).max(1).default(0.6),
  locked: z.boolean().default(true),
});

export const floorDecorSchema = z
  .object({
    schemaVersion: z.literal(2),
    background: backgroundSchema.nullable().default(null),
    elements: z.array(decorElementSchema).max(3000).default([]),
  })
  .superRefine((d, ctx) => {
    const ids = new Set(d.elements.map((e) => e.id));
    d.elements.forEach((e, i) => {
      if (e.kind === "door") {
        const target = e.anchor.kind === "room" ? e.anchor.roomId : e.anchor.wallId;
        if (!ids.has(target)) ctx.addIssue({ code: "custom", path: ["elements", i, "anchor"], message: "门的宿主不存在" });
      }
    });
  });

// ── v1（迁移用）────────────────────────────────────────────────────────────
export const furnitureTypeV1Schema = z.enum(["meeting", "pantry", "printer", "elevator", "stairs", "restroom", "storage", "reception", "custom"]);
const doorV1Schema = z.object({ kind: z.literal("door"), ...placed, w: num.min(20).max(500).default(90), flip: z.boolean().default(false) });
const furnitureV1Schema = z.object({ kind: z.literal("furniture"), ...placed, type: furnitureTypeV1Schema, w: num.min(10), h: num.min(10), name: z.string().max(64).default("") });
export const floorDecorSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  background: backgroundSchema.nullable().default(null),
  elements: z.array(z.discriminatedUnion("kind", [wallSchema, doorV1Schema, labelSchema, furnitureV1Schema])).max(2000).default([]),
});

/** 读取数据库里的 decor JSON：v2 直接用，v1 迁移，损坏时回退空布局（不让整页崩掉）。 */
export function parseDecor(raw: unknown): FloorDecor {
  const v2 = floorDecorSchema.safeParse(raw);
  if (v2.success) return v2.data as FloorDecor;
  const v1 = floorDecorSchemaV1.safeParse(raw);
  if (v1.success) return migrateDecorV1(v1.data as FloorDecorV1);
  return { ...EMPTY_DECOR, elements: [] };
}

export const seatInputSchema = z.object({
  id,
  code: z.string().trim().min(1).max(32),
  x: num,
  y: num,
  w: num.min(20).max(1000).default(120),
  h: num.min(20).max(1000).default(60),
  rotation: num.default(0),
  zoneId: z.string().max(64).nullable().default(null),
  status: z.enum(["ACTIVE", "RESERVED", "DISABLED"]).default("ACTIVE"),
  note: z.string().max(500).default(""),
  style: seatStyleSchema.default("desk-basic"),
});

export const zoneInputSchema = z.object({
  id,
  name: z.string().trim().min(1).max(64),
  departmentId: z.string().max(64).nullable().default(null),
  color: z.string().max(32).nullable().default(null),
  geometry: zoneGeometrySchema,
  sortOrder: z.number().int().default(0),
});
