import { z } from "zod";
import { OBJECT_CATEGORIES, partSchema } from "@/lib/ai/object-spec-schema";

/** 数据库里存的 ObjectSpec */
export const storedSpecSchema = z.object({
  id: z.string().min(1).max(80),
  footprint: z.tuple([z.number().min(5).max(600), z.number().min(5).max(600)]),
  height: z.number().min(2).max(400),
  parts: z.array(partSchema).min(1).max(40),
});

export const objectTypeInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  category: z.enum(OBJECT_CATEGORIES),
  w: z.number().int().min(5).max(600),
  d: z.number().int().min(5).max(600),
  h: z.number().int().min(2).max(400),
  spec: storedSpecSchema,
  thumbnailKey: z.string().max(200).nullable().optional(),
});
export type ObjectTypeInput = z.infer<typeof objectTypeInputSchema>;

export const objectTypePatchSchema = objectTypeInputSchema.partial().extend({ isActive: z.boolean().optional() });
