/**
 * 内置的参数化 3D 规格（ObjectSpec DSL）：工位部件与物件库道具。
 * 坐标：cm，y 向上，原点在脚印中心的地面；part.pos 是部件中心。
 */
import type { ObjectSpec, Part } from "./object-spec";
import type { SeatStyle } from "./types";

const box = (size: [number, number, number], pos: [number, number, number], color: Part["color"], extra: Partial<Part> = {}): Part => ({ shape: "box", size, pos, color, ...extra });
const rbox = (size: [number, number, number], pos: [number, number, number], color: Part["color"], radius = 2, extra: Partial<Part> = {}): Part => ({ shape: "rbox", size, pos, color, radius, ...extra });
const cyl = (r: number, h: number, pos: [number, number, number], color: Part["color"], extra: Partial<Part> = {}): Part => ({ shape: "cylinder", size: [r * 2, h, r * 2], pos, color, radius: r, ...extra });
const sphere = (r: number, pos: [number, number, number], color: Part["color"], extra: Partial<Part> = {}): Part => ({ shape: "sphere", size: [r * 2, r * 2, r * 2], pos, color, radius: r, ...extra });

const DESK_H = 74;
const TOP_T = 3;

/** 工位桌：桌面 + 前挡板 + 两侧板；L 桌多一块侧翼。座位朝向：椅子在 +z（2D 里的下方）。 */
export function deskSpec(style: SeatStyle, w: number, d: number): ObjectSpec {
  const parts: Part[] = [
    rbox([w, TOP_T, d], [0, DESK_H - TOP_T / 2, 0], "$desk", 1.5, { name: "top" }),
    box([w - 4, DESK_H - 12, 2], [0, (DESK_H - 12) / 2, -d / 2 + 2], "$frame", { name: "modesty" }),
    box([2, DESK_H - 4, d - 6], [-w / 2 + 2, (DESK_H - 4) / 2, 0], "$frame"),
    box([2, DESK_H - 4, d - 6], [w / 2 - 2, (DESK_H - 4) / 2, 0], "$frame"),
  ];
  if (style === "desk-l" || style === "desk-l-left") {
    const wingW = Math.max(40, w * 0.45);
    const wingD = Math.max(40, d * 0.45);
    const sx = style === "desk-l" ? 1 : -1;
    parts.push(rbox([wingW, TOP_T, wingD], [sx * (w / 2 - wingW / 2), DESK_H - TOP_T / 2, d / 2 + wingD / 2 - 2], "$desk", 1.5));
    parts.push(box([2, DESK_H - 4, wingD - 6], [sx * (w / 2 - 2), (DESK_H - 4) / 2, d / 2 + wingD / 2], "$frame"));
  }
  if (style === "bench") {
    // 长条工位：中间加一道矮隔板
    parts.push(box([w, 30, 2], [0, DESK_H + 15, -d / 2 + 1], "$fabric"));
  }
  return { id: `desk:${style}:${w}x${d}`, footprint: [w, d], height: DESK_H, parts };
}

export const MONITOR: ObjectSpec = {
  id: "monitor",
  footprint: [55, 20],
  height: 45,
  parts: [
    cyl(9, 1.5, [0, DESK_H + 0.75, 0], "$metal"),
    box([3, 18, 2], [0, DESK_H + 10, 0], "$metal"),
    rbox([55, 33, 2.5], [0, DESK_H + 33, 0], "$frame", 1.5),
    box([50, 28, 0.6], [0, DESK_H + 33, 1.6], "$screen", { name: "screen" }),
  ],
};

export const KEYBOARD: ObjectSpec = {
  id: "keyboard",
  footprint: [42, 14],
  height: 2,
  parts: [rbox([42, 1.8, 14], [0, DESK_H + 0.9, 0], "$frame", 0.8), box([12, 1, 8], [30, DESK_H + 0.5, 0], "$frame")],
};

/** 五星轮办公椅：座垫 + 靠背（部门色）+ 立柱 + 五星脚 */
export const CHAIR: ObjectSpec = {
  id: "chair",
  footprint: [50, 50],
  height: 95,
  parts: [
    rbox([46, 6, 46], [0, 45, 0], "$chair", 3, { name: "seat" }),
    rbox([44, 46, 5], [0, 70, 20], "$chair", 3, { name: "back" }),
    cyl(2.5, 40, [0, 22, 0], "$metal"),
    cyl(4, 2, [0, 2, 0], "$metal"),
    ...[0, 72, 144, 216, 288].map<Part>((deg) => ({
      shape: "box",
      size: [26, 2, 4],
      pos: [Math.cos((deg * Math.PI) / 180) * 12, 2, Math.sin((deg * Math.PI) / 180) * 12],
      rot: [0, -(deg * Math.PI) / 180, 0],
      color: "$metal",
    })),
    box([4, 2, 18], [-24, 66, 8], "$frame"),
    box([4, 2, 18], [24, 66, 8], "$frame"),
  ],
};

export const PLANT_SMALL: ObjectSpec = {
  id: "plant-small",
  footprint: [16, 16],
  height: 30,
  parts: [cyl(7, 12, [0, DESK_H + 6, 0], "$pot"), sphere(9, [0, DESK_H + 20, 0], "$leaf", { segments: 10 }), sphere(6, [5, DESK_H + 24, 3], "$leaf", { segments: 8 })],
};

// ── 物件库道具 ──────────────────────────────────────────────────────────────
function table(id: string, w: number, d: number, h: number, round = false): ObjectSpec {
  const legs: Part[] = round
    ? [cyl(4, h - 4, [0, (h - 4) / 2, 0], "$metal"), cyl(Math.min(w, d) * 0.3, 2, [0, 1, 0], "$metal")]
    : [
        cyl(2.5, h - 3, [-w / 2 + 8, (h - 3) / 2, -d / 2 + 8], "$metal"),
        cyl(2.5, h - 3, [w / 2 - 8, (h - 3) / 2, -d / 2 + 8], "$metal"),
        cyl(2.5, h - 3, [-w / 2 + 8, (h - 3) / 2, d / 2 - 8], "$metal"),
        cyl(2.5, h - 3, [w / 2 - 8, (h - 3) / 2, d / 2 - 8], "$metal"),
      ];
  const top: Part = round ? cyl(w / 2, 3, [0, h - 1.5, 0], "$wood", { segments: 32 }) : rbox([w, 3, d], [0, h - 1.5, 0], "$wood", 2);
  return { id, footprint: [w, d], height: h, parts: [top, ...legs] };
}

function sofa(id: string, w: number, d: number, seats: number): ObjectSpec {
  const parts: Part[] = [
    rbox([w, 20, d], [0, 10, 0], "$fabric", 4),
    rbox([w, 42, 18], [0, 36, -d / 2 + 9], "$fabric", 5),
    rbox([14, 34, d - 4], [-w / 2 + 7, 30, 0], "$fabric", 4),
    rbox([14, 34, d - 4], [w / 2 - 7, 30, 0], "$fabric", 4),
  ];
  const inner = w - 28;
  for (let i = 0; i < seats; i++) {
    const cw = inner / seats;
    parts.push(rbox([cw - 4, 12, d - 30], [-inner / 2 + cw * (i + 0.5), 26, 6], "$fabric", 4));
  }
  return { id, footprint: [w, d], height: 85, parts };
}

function cabinet(id: string, w: number, d: number, h: number, doors = 2): ObjectSpec {
  const parts: Part[] = [rbox([w, h, d], [0, h / 2, 0], "$wood", 1)];
  for (let i = 0; i < doors; i++) {
    const cw = w / doors;
    parts.push(box([cw - 3, h - 6, 1], [-w / 2 + cw * (i + 0.5), h / 2, d / 2 + 0.5], "$desk"));
    parts.push(cyl(1, 6, [-w / 2 + cw * (i + 0.5) + (i % 2 === 0 ? cw / 2 - 4 : -cw / 2 + 4), h / 2, d / 2 + 1.5], "$metal"));
  }
  return { id, footprint: [w, d], height: h, parts };
}

function bookshelf(id: string, w: number, d: number, h: number): ObjectSpec {
  const parts: Part[] = [box([2, h, d], [-w / 2 + 1, h / 2, 0], "$wood"), box([2, h, d], [w / 2 - 1, h / 2, 0], "$wood"), box([w, 2, d], [0, h - 1, 0], "$wood"), box([w, 1, d], [0, 0.5, 0], "$wood"), box([w - 4, h, 1], [0, h / 2, -d / 2 + 0.5], "$wood")];
  const shelves = Math.max(2, Math.round(h / 35));
  for (let i = 1; i < shelves; i++) parts.push(box([w - 4, 2, d - 2], [0, (h / shelves) * i, 0], "$wood"));
  // 几本书
  for (let i = 0; i < shelves; i++) for (let b = 0; b < 4; b++) parts.push(box([w / 6, 20, d * 0.6], [-w / 2 + 6 + (b + 0.5) * (w / 6) * 1.1, (h / shelves) * i + 12, 0], b % 2 ? "$accent" : "$fabric"));
  return { id, footprint: [w, d], height: h, parts };
}

export const PROP_SPECS: Record<string, ObjectSpec> = {
  "desk-straight": deskSpec("desk-basic", 120, 60),
  "desk-l": deskSpec("desk-l", 160, 120),
  chair: CHAIR,
  monitor: { ...MONITOR, parts: MONITOR.parts.map((p) => ({ ...p, pos: [p.pos![0], p.pos![1] - DESK_H, p.pos![2]] as [number, number, number] })), height: 45 },
  "meeting-table-6": table("meeting-table-6", 240, 120, 75),
  "meeting-table-8": table("meeting-table-8", 300, 120, 75),
  "round-table-4": table("round-table-4", 120, 120, 75, true),
  "sofa-2": sofa("sofa-2", 160, 85, 2),
  "sofa-3": sofa("sofa-3", 220, 85, 3),
  armchair: sofa("armchair", 85, 85, 1),
  "coffee-table": table("coffee-table", 100, 55, 42),
  cabinet: cabinet("cabinet", 80, 45, 110, 2),
  locker: cabinet("locker", 40, 50, 180, 1),
  bookshelf: bookshelf("bookshelf", 100, 35, 200),
  whiteboard: { id: "whiteboard", footprint: [180, 8], height: 190, parts: [box([180, 120, 3], [0, 130, 0], "$desk"), box([184, 124, 1], [0, 130, -2], "$metal"), box([180, 4, 8], [0, 70, 0], "$metal"), box([3, 70, 3], [-80, 35, 0], "$metal"), box([3, 70, 3], [80, 35, 3], "$metal")] },
  "tv-screen": { id: "tv-screen", footprint: [140, 12], height: 180, parts: [rbox([140, 80, 4], [0, 140, 0], "$frame", 1), box([134, 74, 0.6], [0, 140, 2.5], "$screen"), box([6, 100, 6], [0, 50, -3], "$metal"), box([60, 2, 12], [0, 1, 0], "$metal")] },
  plant: { id: "plant", footprint: [50, 50], height: 150, parts: [cyl(18, 40, [0, 20, 0], "$pot"), cyl(3, 40, [0, 60, 0], "$wood"), sphere(28, [0, 100, 0], "$leaf", { segments: 12 }), sphere(20, [14, 122, 6], "$leaf", { segments: 10 }), sphere(18, [-12, 118, -8], "$leaf", { segments: 10 })] },
  printer: { id: "printer", footprint: [60, 60], height: 100, parts: [rbox([60, 90, 60], [0, 45, 0], "$frame", 3), box([50, 4, 40], [0, 92, 0], "$desk"), box([44, 8, 30], [0, 96, 0], "$frame"), box([30, 1, 20], [0, 100.5, 0], "$screen")] },
  "water-dispenser": { id: "water-dispenser", footprint: [35, 35], height: 130, parts: [rbox([35, 100, 35], [0, 50, 0], "$desk", 2), cyl(12, 30, [0, 115, 0], "$glass", { segments: 16 }), box([10, 6, 4], [0, 70, 18], "$accent"), box([10, 6, 4], [0, 62, 18], "$screen")] },
  fridge: { id: "fridge", footprint: [60, 65], height: 170, parts: [rbox([60, 170, 65], [0, 85, 0], "$metal", 2), box([2, 60, 3], [24, 130, 33], "$frame"), box([2, 60, 3], [24, 60, 33], "$frame"), box([58, 1, 64], [0, 110, 0], "$frame")] },
  partition: { id: "partition", footprint: [120, 6], height: 140, parts: [box([120, 140, 4], [0, 70, 0], "$fabric"), box([124, 3, 6], [0, 141, 0], "$metal"), box([3, 140, 6], [-60, 70, 0], "$metal"), box([3, 140, 6], [60, 70, 0], "$metal")] },
  "phone-booth": { id: "phone-booth", footprint: [110, 110], height: 220, parts: [rbox([110, 220, 110], [0, 110, 0], "$frame", 4), box([70, 180, 1], [0, 110, 55.5], "$glass"), box([90, 4, 40], [0, 100, -20], "$desk"), rbox([36, 40, 36], [0, 30, 10], "$chair", 3)] },
  "reception-counter": { id: "reception-counter", footprint: [240, 80], height: 110, parts: [rbox([240, 110, 60], [0, 55, -10], "$wood", 2), box([240, 4, 80], [0, 112, 0], "$desk"), box([200, 3, 60], [0, 74, -10], "$desk"), box([240, 6, 6], [0, 30, 20], "$accent")] },
  custom: { id: "custom", footprint: [100, 100], height: 100, parts: [rbox([100, 100, 100], [0, 50, 0], "$desk", 2)] },
};
