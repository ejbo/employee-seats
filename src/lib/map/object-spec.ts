/**
 * 参数化物件 DSL（2D 符号与 3D 渲染共用；也是「照片生成物件」的输出格式）。
 * 单位厘米，y 向上，原点在脚印中心、地面高度。颜色可以是 hex，或 $token（按主题调色板解析）。
 */
export type PartShape = "box" | "rbox" | "cylinder" | "sphere";
export type ColorToken = "$desk" | "$frame" | "$chair" | "$accent" | "$screen" | "$metal" | "$leaf" | "$pot" | "$wood" | "$fabric" | "$glass";

export interface Part {
  shape: PartShape;
  /** [宽 x, 高 y, 深 z]（球体用 size[0] 作直径） */
  size: [number, number, number];
  /** 相对原点的中心位置 */
  pos?: [number, number, number];
  /** 欧拉角（度） */
  rot?: [number, number, number];
  color: string | ColorToken;
  /** rbox 圆角 / cylinder 上下半径比 */
  radius?: number;
  segments?: number;
  name?: string;
}

export interface ObjectSpec {
  id: string;
  /** 脚印 [宽, 深]（cm） */
  footprint: [number, number];
  /** 总高（cm），缺省取 parts 最高点 */
  height?: number;
  parts: Part[];
}

export const COLOR_TOKENS: ColorToken[] = ["$desk", "$frame", "$chair", "$accent", "$screen", "$metal", "$leaf", "$pot", "$wood", "$fabric", "$glass"];

export function specHeight(spec: ObjectSpec): number {
  if (spec.height) return spec.height;
  let top = 0;
  for (const p of spec.parts) {
    const y = (p.pos?.[1] ?? 0) + (p.shape === "sphere" ? p.size[0] / 2 : p.size[1] / 2);
    if (y > top) top = y;
  }
  return top;
}

/** 单个盒子的最简规格（占位 / 自定义盒） */
export function boxSpec(id: string, w: number, d: number, h: number, color: string | ColorToken = "$desk"): ObjectSpec {
  return { id, footprint: [w, d], height: h, parts: [{ shape: "rbox", size: [w, h, d], pos: [0, h / 2, 0], color, radius: 2 }] };
}
