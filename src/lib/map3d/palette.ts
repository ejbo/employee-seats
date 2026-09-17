/** 从 CSS 变量读取 3D 场景配色（随明暗主题变化）。 */
export interface Palette3D {
  canvas: string;
  floor: string;
  grid: string;
  wall: string;
  desk: string;
  deskEdge: string;
  chair: string;
  monitor: string;
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
    wall: cssVar("--map-wall", "#3f3f46"),
    desk: isDark ? "#2a2a31" : "#f4efe7",
    deskEdge: isDark ? "#3c3c45" : "#d9d2c6",
    chair: isDark ? "#3a3a44" : "#c9c9d1",
    monitor: isDark ? "#0f0f12" : "#2a2a31",
    room: isDark ? "#1c1c22" : "#f7f7f8",
    roomEdge: isDark ? "#3a3a44" : "#c9c9d1",
    text: cssVar("--seat-text", "#18181b"),
    sub: cssVar("--seat-sub", "#6b6b76"),
    surface: cssVar("--surface", "#ffffff"),
    info: cssVar("--info", "#2563eb"),
    isDark,
  };
}
