/** 12 色低饱和部门调色板：区域淡色 8–16% 透明度、座位色条 100% 时都好看。 */
export const DEPARTMENT_PALETTE = [
  "#4f7cac", // 钢蓝
  "#5b9a8b", // 青
  "#c08a3e", // 赭
  "#8e6fb8", // 紫
  "#c4685f", // 陶土
  "#5f8f4a", // 苔绿
  "#b56b8a", // 玫瑰
  "#4d8fa6", // 湖蓝
  "#a37b4a", // 古铜
  "#6d7fbf", // 靛
  "#6f9d5b", // 草绿
  "#b47a3b", // 琥珀
] as const;

export const NEUTRAL_ZONE_COLOR = "#8a8a93";

export function paletteColor(index: number): string {
  return DEPARTMENT_PALETTE[((index % DEPARTMENT_PALETTE.length) + DEPARTMENT_PALETTE.length) % DEPARTMENT_PALETTE.length];
}

/** 给一个名字挑一个稳定的颜色（同名同色）。 */
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return paletteColor(h);
}

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}
