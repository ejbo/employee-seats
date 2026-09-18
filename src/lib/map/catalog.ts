import type { SeatStyle } from "./types";
/**
 * 内置物件库。尺寸单位 cm（w = 宽，d = 深/高度方向在平面上的长度，h = 高）。
 * 3D 规格先用程序化占位盒，B 阶段替换为精细模型 / glTF。
 */
import { boxSpec, type ObjectSpec } from "./object-spec";
import { PROP_SPECS } from "./object-specs";

export type ObjectCategory = "desk" | "seating" | "table" | "storage" | "office" | "kitchen" | "decor" | "partition";
export type GlyphKind =
  | "desk"
  | "desk-l"
  | "chair"
  | "monitor"
  | "table-rect"
  | "table-round"
  | "sofa"
  | "armchair"
  | "coffee-table"
  | "cabinet"
  | "locker"
  | "bookshelf"
  | "whiteboard"
  | "screen"
  | "plant"
  | "printer"
  | "water"
  | "fridge"
  | "partition"
  | "booth"
  | "counter"
  | "box";

export interface ObjectDef {
  key: string;
  name: string;
  category: ObjectCategory;
  w: number;
  d: number;
  h: number;
  glyph: GlyphKind;
  resizable?: boolean;
  model: { kind: "procedural"; spec: ObjectSpec } | { kind: "glb"; url: string; scale?: number };
}

export const CATEGORY_LABELS: Record<ObjectCategory, string> = {
  desk: "工位与桌",
  seating: "座椅",
  table: "会议桌",
  storage: "储物",
  office: "办公设备",
  kitchen: "茶水",
  decor: "装饰",
  partition: "隔断",
};

const p = (key: string, name: string, category: ObjectCategory, w: number, d: number, h: number, glyph: GlyphKind, color = "$desk", resizable = false): ObjectDef => ({
  key,
  name,
  category,
  w,
  d,
  h,
  glyph,
  resizable,
  model: { kind: "procedural", spec: boxSpec(key, w, d, h, color) },
});

export const CATALOG: ObjectDef[] = [
  p("desk-straight", "直桌", "desk", 120, 60, 74, "desk"),
  p("desk-l", "L 形桌", "desk", 160, 160, 74, "desk-l"),
  p("chair", "办公椅", "seating", 55, 55, 95, "chair", "$chair"),
  p("monitor", "显示器", "office", 55, 20, 45, "monitor", "$frame"),
  p("meeting-table-6", "6 人会议桌", "table", 240, 120, 75, "table-rect", "$wood"),
  p("meeting-table-8", "8 人会议桌", "table", 300, 120, 75, "table-rect", "$wood"),
  p("round-table-4", "4 人圆桌", "table", 120, 120, 75, "table-round", "$wood"),
  p("sofa-2", "双人沙发", "seating", 160, 85, 85, "sofa", "$fabric"),
  p("sofa-3", "三人沙发", "seating", 220, 85, 85, "sofa", "$fabric"),
  p("armchair", "单人沙发", "seating", 85, 85, 85, "armchair", "$fabric"),
  p("coffee-table", "茶几", "table", 100, 60, 45, "coffee-table", "$wood"),
  p("cabinet", "文件柜", "storage", 90, 45, 180, "cabinet", "$frame"),
  p("locker", "储物柜", "storage", 40, 50, 180, "locker", "$metal"),
  p("bookshelf", "书架", "storage", 120, 35, 200, "bookshelf", "$wood"),
  p("whiteboard", "白板", "office", 180, 10, 120, "whiteboard", "$frame", true),
  p("tv-screen", "电视 / 大屏", "office", 160, 10, 100, "screen", "$screen", true),
  p("plant", "绿植", "decor", 50, 50, 150, "plant", "$leaf"),
  p("printer", "打印机", "office", 60, 60, 110, "printer", "$metal"),
  p("water-dispenser", "饮水机", "kitchen", 35, 35, 110, "water", "$metal"),
  p("fridge", "冰箱", "kitchen", 60, 65, 180, "fridge", "$metal"),
  p("partition", "隔断", "partition", 120, 5, 150, "partition", "$frame", true),
  p("phone-booth", "电话亭", "partition", 110, 110, 220, "booth", "$frame"),
  p("reception-counter", "前台", "office", 240, 80, 110, "counter", "$wood", true),
  p("custom", "自定义盒", "decor", 100, 100, 100, "box", "$frame", true),
];

export const CATALOG_BY_KEY: Record<string, ObjectDef> = Object.fromEntries(CATALOG.map((d) => [d.key, d]));

/** 物件的 3D 规格：优先用精细规格，没有则用占位盒。 */
export function specFor(def: ObjectDef): ObjectSpec {
  const rich = PROP_SPECS[def.key];
  if (rich) return rich;
  return def.model.kind === "procedural" ? def.model.spec : boxSpec(def.key, def.w, def.d, def.h, "$desk");
}

export function catalogDef(typeKey: string): ObjectDef {
  return CATALOG_BY_KEY[typeKey] ?? CATALOG_BY_KEY.custom;
}

/** 物件库里的工位预设（放置的是座位，不是物件） */
export interface SeatPreset {
  style: SeatStyle;
  name: string;
  w: number;
  h: number;
}
export const SEAT_PRESETS: SeatPreset[] = [
  { style: "desk-basic", name: "直桌工位", w: 120, h: 60 },
  { style: "desk-l", name: "L 形工位（右）", w: 160, h: 120 },
  { style: "desk-l-left", name: "L 形工位（左）", w: 160, h: 120 },
  { style: "bench", name: "长条工位", w: 140, h: 70 },
];
export const SEAT_PRESET_BY_STYLE: Record<SeatStyle, SeatPreset> = Object.fromEntries(SEAT_PRESETS.map((p) => [p.style, p])) as Record<SeatStyle, SeatPreset>;
