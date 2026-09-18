/** 从 CSS 变量读取 3D 场景配色（随明暗主题变化）。 */
export interface Palette3D {
  canvas: string;
  floor: string;
  grid: string;
  wall: string;
  wallCap: string;
  frame: string;
  doorLeaf: string;
  desk: string;
  deskEdge: string;
  chair: string;
  monitor: string;
  screenOn: string;
  reservedDesk: string;
  metal: string;
  leaf: string;
  pot: string;
  wood: string;
  fabric: string;
  glass: string;
  room: string;
  roomEdge: string;
  text: string;
  sub: string;
  surface: string;
  info: string;
  isDark: boolean;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function readPalette(): Palette3D {
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  return {
    canvas: cssVar("--map-canvas", "#f3f3f5"),
    floor: cssVar("--map-floor", "#ffffff"),
    grid: cssVar("--map-grid", "#e4e4e8"),
    wall: isDark ? "#c9c9d2" : "#3f3f46",
    wallCap: isDark ? "#e2e2ea" : "#5a5a63",
    frame: isDark ? "#8f8f99" : "#2f2f36",
    doorLeaf: isDark ? "#4a3d33" : "#c9a97e",
    desk: isDark ? "#2a2a31" : "#f4efe7",
    deskEdge: isDark ? "#3c3c45" : "#d9d2c6",
    chair: isDark ? "#3a3a44" : "#c9c9d1",
    monitor: isDark ? "#0f0f12" : "#2a2a31",
    screenOn: isDark ? "#7fb6ff" : "#dbe9ff",
    reservedDesk: isDark ? "#3a3226" : "#f3e3c2",
    metal: isDark ? "#55555f" : "#9a9aa4",
    leaf: isDark ? "#3f6b46" : "#6fae74",
    pot: isDark ? "#4a3a30" : "#b08968",
    wood: isDark ? "#4a3b2e" : "#c9a97e",
    fabric: isDark ? "#3b4250" : "#8fa0b8",
    glass: isDark ? "#7fa2c4" : "#bcd7ee",
    room: isDark ? "#1c1c22" : "#f7f7f8",
    roomEdge: isDark ? "#3a3a44" : "#c9c9d1",
    text: cssVar("--seat-text", "#18181b"),
    sub: cssVar("--seat-sub", "#6b6b76"),
    surface: cssVar("--surface", "#ffffff"),
    info: cssVar("--info", "#2563eb"),
    isDark,
  };
}
