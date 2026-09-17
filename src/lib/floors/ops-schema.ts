import { z } from "zod";
import { floorDecorSchema, seatInputSchema, zoneInputSchema } from "@/lib/map/schema";

export const floorPatchOpSchema = z.object({
  width: z.number().int().min(500).max(50000).optional(),
  height: z.number().int().min(500).max(50000).optional(),
  gridSize: z.number().int().min(5).max(200).optional(),
  backgroundKey: z.string().max(200).nullable().optional(),
});

export const layoutOpSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("seat.upsert"), seat: seatInputSchema }),
  z.object({ type: z.literal("seat.delete"), id: z.string().min(1) }),
  z.object({ type: z.literal("zone.upsert"), zone: zoneInputSchema }),
  z.object({ type: z.literal("zone.delete"), id: z.string().min(1) }),
  z.object({ type: z.literal("decor.set"), decor: floorDecorSchema }),
  z.object({ type: z.literal("floor.patch"), patch: floorPatchOpSchema }),
]);
export type LayoutOp = z.infer<typeof layoutOpSchema>;

export const layoutSaveSchema = z.object({
  baseVersion: z.number().int().min(1),
  ops: z.array(layoutOpSchema).max(5000),
});
export type LayoutSaveBody = z.infer<typeof layoutSaveSchema>;
