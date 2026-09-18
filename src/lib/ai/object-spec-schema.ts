/**
 * 照片 → 参数化物件（ObjectSpec DSL）：模型输出 schema、提示词、规范化与 2D 俯视投影。纯函数。
 */
import { z } from "zod";
import type { ObjectSpec, Part } from "@/lib/map/object-spec";
import type { ObjectCategory } from "@/lib/map/catalog";

export const OBJECT_CATEGORIES: ObjectCategory[] = ["desk", "seating", "table", "storage", "office", "kitchen", "decor", "partition"];

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const vec3 = z.tuple([z.coerce.number(), z.coerce.number(), z.coerce.number()]);

export const partSchema = z.object({
  shape: z.enum(["box", "rbox", "cylinder", "sphere"]).catch("box"),
  size: z.tuple([num(0.5, 600), num(0.5, 400), num(0.5, 600)]),
  pos: vec3.optional(),
  rot: vec3.optional(),
  color: z.string().regex(/^(#[0-9a-fA-F]{6}|\$[a-z]+)$/).catch("$desk"),
  radius: num(0, 100).optional(),
  segments: num(3, 64).optional(),
  name: z.string().max(40).optional(),
});

export const generatedObjectSchema = z.object({
  name: z.string().min(1).max(40),
  category: z.enum(OBJECT_CATEGORIES).catch("office"),
  footprint: z.tuple([num(5, 600), num(5, 600)]),
  height: num(2, 400),
  parts: z.array(partSchema).min(1).max(40),
  confidence: num(0, 1).optional(),
  assumptions: z.string().max(400).optional(),
});
export type GeneratedObject = z.infer<typeof generatedObjectSchema>;

export const OBJECT_SYSTEM_PROMPT = `你是办公家具建模助手。用户会给你一张家具 / 物件的照片（可能还有文字要求），请用一组简单几何体把它拼成一个参数化 3D 模型，输出 JSON。

坐标与单位：厘米；y 向上；原点在物件脚印（俯视占地矩形）的中心、地面高度 0；每个部件的 pos 是该部件的中心。

输出一个 JSON 对象（不要 markdown，不要解释）：
{
  "name": "双人沙发",
  "category": "seating",            // desk|seating|table|storage|office|kitchen|decor|partition
  "footprint": [160, 85],           // 占地 [宽 x, 深 z]
  "height": 85,
  "parts": [
    { "shape": "rbox", "size": [160, 20, 85], "pos": [0, 10, 0], "color": "$fabric", "radius": 4, "name": "座" },
    { "shape": "box", "size": [4, 40, 4], "pos": [70, 20, 30], "rot": [0, 0, 0], "color": "$metal" }
  ],
  "confidence": 0.8,
  "assumptions": "看不见背面，按对称处理"
}

规则：
- shape 只能是 box | rbox（圆角盒，radius 单位 cm）| cylinder（size = [直径, 高, 直径]）| sphere（size = [直径, 直径, 直径]）。
- parts 不超过 40 个；先大后小；用最少的部件表达轮廓（桌面、腿、靠背、坐垫、屏幕、底座…）。
- color 用具体的 #rrggbb，或用语义色 token：$desk（桌面浅木色）$frame（深色框架）$chair（椅面）$accent（强调色）$screen（屏幕）$metal $leaf $pot $wood $fabric $glass。
- 尺寸按常见办公家具的真实尺寸估计（办公桌高 74cm，椅座高 45cm，会议桌高 75cm，柜子深 45cm…）。
- 正面朝 +z（照片正面所对的方向）。`;

/** 把模型输出规范成 ObjectSpec：部件裁进脚印范围内（略放宽），地面以下的部件抬到地面。 */
export function toObjectSpec(g: GeneratedObject, id: string): ObjectSpec {
  const [fw, fd] = g.footprint;
  const parts: Part[] = g.parts.map((p) => {
    const pos: [number, number, number] = p.pos ? [p.pos[0], p.pos[1], p.pos[2]] : [0, p.size[1] / 2, 0];
    const half = p.size[1] / 2;
    if (pos[1] - half < 0) pos[1] = half;
    const part: Part = {
      shape: p.shape,
      size: [p.size[0], p.size[1], p.size[2]],
      pos,
      color: p.color as Part["color"],
    };
    if (p.rot) part.rot = [p.rot[0], p.rot[1], p.rot[2]];
    if (p.radius !== undefined) part.radius = p.radius;
    if (p.segments !== undefined) part.segments = Math.round(p.segments);
    if (p.name) part.name = p.name;
    return part;
  });
  // 若部件整体超出脚印 15% 以上，等比缩到脚印内
  let maxX = 0;
  let maxZ = 0;
  let maxY = 0;
  for (const p of parts) {
    maxX = Math.max(maxX, Math.abs(p.pos![0]) + p.size[0] / 2);
    maxZ = Math.max(maxZ, Math.abs(p.pos![2]) + p.size[2] / 2);
    maxY = Math.max(maxY, p.pos![1] + p.size[1] / 2);
  }
  const k = Math.min(1, (fw / 2) / (maxX || 1) / 0.87, (fd / 2) / (maxZ || 1) / 0.87, g.height / (maxY || 1) / 0.9);
  const scaled = k < 1 ? parts.map((p) => ({ ...p, size: p.size.map((v) => v * k) as Part["size"], pos: p.pos!.map((v) => v * k) as [number, number, number], radius: p.radius !== undefined ? p.radius * k : undefined })) : parts;
  return { id, footprint: [fw, fd], height: g.height, parts: scaled };
}

/** 俯视投影：给 2D 符号用（矩形 / 圆），按部件顶面高度排序，低的先画。 */
export interface TopDownShape {
  kind: "rect" | "circle";
  /** 相对脚印左上角（0..w, 0..d） */
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  top: number;
}

export function projectTopDown(spec: ObjectSpec): TopDownShape[] {
  const [fw, fd] = spec.footprint;
  const out: TopDownShape[] = spec.parts.map((p) => {
    const [px, py, pz] = p.pos ?? [0, 0, 0];
    const rotY = p.rot?.[1] ?? 0;
    const swap = Math.abs(Math.sin(rotY)) > Math.abs(Math.cos(rotY));
    const w = swap ? p.size[2] : p.size[0];
    const h = swap ? p.size[0] : p.size[2];
    return { kind: p.shape === "cylinder" || p.shape === "sphere" ? "circle" : "rect", x: fw / 2 + px - w / 2, y: fd / 2 + pz - h / 2, w, h, color: p.color, top: py + p.size[1] / 2 };
  });
  return out.sort((a, b) => a.top - b.top);
}
