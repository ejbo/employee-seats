import { z } from "zod";
import { EMPTY_DECOR, type FloorDecor, type ZoneGeometry } from "./types";

const num = z.number().finite();
const point = z.tuple([num, num]);

export const zoneGeometrySchema: z.ZodType<ZoneGeometry> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rect"), x: num, y: num, w: num.min(1), h: num.min(1), rotation: num.optional() }),
  z.object({ type: z.literal("polygon"), points: z.array(point).min(3) }),
]);

const placed = { id: z.string().min(1).max(64), x: num, y: num, rotation: num.default(0) };

export const wallSchema = z.object({
  kind: z.literal("wall"),
  id: z.string().min(1).max(64),
  points: z.array(point).min(2),
  thickness: num.min(1).max(200).default(15),
});

export const doorSchema = z.object({
  kind: z.literal("door"),
  ...placed,
  w: num.min(20).max(500).default(90),
  flip: z.boolean().default(false),
});

export const labelSchema = z.object({
  kind: z.literal("label"),
  ...placed,
  text: z.string().max(200),
  fontSize: num.min(8).max(400).default(28),
  color: z.string().max(32).nullable().default(null),
});

export const furnitureTypeSchema = z.enum([
  "meeting",
  "pantry",
  "printer",
  "elevator",
  "stairs",
  "restroom",
  "storage",
  "reception",
  "custom",
]);

export const furnitureSchema = z.object({
  kind: z.literal("furniture"),
  ...placed,
  type: furnitureTypeSchema,
  w: num.min(10),
  h: num.min(10),
  name: z.string().max(64).default(""),
});

export const decorElementSchema = z.discriminatedUnion("kind", [wallSchema, doorSchema, labelSchema, furnitureSchema]);

export const backgroundSchema = z.object({
  x: num,
  y: num,
  w: num.min(1),
  h: num.min(1),
  opacity: num.min(0).max(1).default(0.6),
  locked: z.boolean().default(true),
});

export const floorDecorSchema = z.object({
  schemaVersion: z.literal(1),
  background: backgroundSchema.nullable().default(null),
  elements: z.array(decorElementSchema).max(2000).default([]),
});

/** 读取数据库里的 decor JSON；损坏或旧版本时回退到空布局而不是让整页崩掉。 */
export function parseDecor(raw: unknown): FloorDecor {
  const r = floorDecorSchema.safeParse(raw);
  if (r.success) return r.data as FloorDecor;
  return { ...EMPTY_DECOR };
}

export const seatInputSchema = z.object({
  id: z.string().min(1).max(64),
  code: z.string().trim().min(1).max(32),
  x: num,
  y: num,
  w: num.min(20).max(1000).default(120),
  h: num.min(20).max(1000).default(60),
  rotation: num.default(0),
  zoneId: z.string().max(64).nullable().default(null),
  status: z.enum(["ACTIVE", "RESERVED", "DISABLED"]).default("ACTIVE"),
  note: z.string().max(500).default(""),
});

export const zoneInputSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(64),
  departmentId: z.string().max(64).nullable().default(null),
  color: z.string().max(32).nullable().default(null),
  geometry: zoneGeometrySchema,
  sortOrder: z.number().int().default(0),
});
