import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

export const officeInputSchema = z.object({
  institute: text(64).min(1, "研究所不能为空"),
  city: text(64).min(1, "城市不能为空"),
  name: text(64).min(1, "办公室名称不能为空"),
  address: text(200).default(""),
  description: text(500).default(""),
  sortOrder: z.number().int().default(0),
});
export type OfficeInput = z.infer<typeof officeInputSchema>;
export const officePatchSchema = officeInputSchema.partial();

export const floorInputSchema = z.object({
  name: text(32).min(1, "楼层名称不能为空"),
  /** 画布宽高（cm） */
  width: z.number().int().min(500).max(50000).default(4000),
  height: z.number().int().min(500).max(50000).default(3000),
  gridSize: z.number().int().min(5).max(200).default(20),
  sortOrder: z.number().int().default(0),
});
export type FloorInput = z.infer<typeof floorInputSchema>;
export const floorPatchSchema = floorInputSchema.partial();

export const departmentInputSchema = z.object({
  name: text(64).min(1, "部门名称不能为空"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "颜色需为 #RRGGBB")
    .optional(),
  sortOrder: z.number().int().optional(),
});
export const departmentPatchSchema = departmentInputSchema.partial();
