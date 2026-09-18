/**
 * 门的解析：把「锚定在房间边 / 墙段上 + offset」换算成世界坐标的门段，供 2D 符号、3D 与墙派生使用。
 */
import type { DoorAnchor, DoorEl, MapElement, RoomEl, WallEl } from "./types";
import { DEFAULT_DOOR_WIDTH, WALL_THICKNESS } from "./types";
import { roomEdges, type Pt } from "./rectilinear";

export interface DoorGeom {
  id: string;
  /** 门段起点（沿宿主边方向） */
  a: Pt;
  b: Pt;
  w: number;
  /** 宿主边的方向角（度，屏幕坐标） */
  rotation: number;
  /** 门扇摆向：+1 = 边的右侧（顺时针房间的内侧），-1 = 左侧 */
  swingSign: 1 | -1;
  hinge: "start" | "end";
  thickness: number;
  hostKind: "room" | "wall";
  hostId: string;
}

export interface HostEdge {
  anchor: DoorAnchor;
  a: Pt;
  b: Pt;
  thickness: number;
  /** 房间：走廊也可以挂门（无墙时只画门扇） */
  hostKind: "room" | "wall";
}

/** 楼层里所有可挂门的边（房间边 + 轴对齐墙段）。 */
export function hostEdges(elements: Iterable<MapElement>): HostEdge[] {
  const out: HostEdge[] = [];
  for (const el of elements) {
    if (el.kind === "room") {
      for (const e of roomEdges(el.points)) out.push({ anchor: { kind: "room", roomId: el.id, edgeIndex: e.index }, a: e.a, b: e.b, thickness: WALL_THICKNESS, hostKind: "room" });
    } else if (el.kind === "wall") {
      for (let i = 0; i < el.points.length - 1; i++) {
        out.push({ anchor: { kind: "wall", wallId: el.id, segIndex: i }, a: el.points[i], b: el.points[i + 1], thickness: el.thickness, hostKind: "wall" });
      }
    }
  }
  return out;
}

export function findHostEdge(anchor: DoorAnchor, byId: (id: string) => MapElement | undefined): HostEdge | null {
  if (anchor.kind === "room") {
    const room = byId(anchor.roomId);
    if (!room || room.kind !== "room") return null;
    const edges = roomEdges((room as RoomEl).points);
    const e = edges[anchor.edgeIndex];
    if (!e) return null;
    return { anchor, a: e.a, b: e.b, thickness: WALL_THICKNESS, hostKind: "room" };
  }
  const wall = byId(anchor.wallId);
  if (!wall || wall.kind !== "wall") return null;
  const w = wall as WallEl;
  const a = w.points[anchor.segIndex];
  const b = w.points[anchor.segIndex + 1];
  if (!a || !b) return null;
  return { anchor, a, b, thickness: w.thickness, hostKind: "wall" };
}

/** 把门放到宿主边上：offset 夹在边内。 */
export function resolveDoor(door: DoorEl, byId: (id: string) => MapElement | undefined): DoorGeom | null {
  const host = findHostEdge(door.anchor, byId);
  if (!host) return null;
  const dx = host.b[0] - host.a[0];
  const dy = host.b[1] - host.a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const w = Math.min(door.w, len);
  const offset = Math.max(0, Math.min(len - w, door.offset));
  const ux = dx / len;
  const uy = dy / len;
  const a: Pt = [host.a[0] + ux * offset, host.a[1] + uy * offset];
  const b: Pt = [a[0] + ux * w, a[1] + uy * w];
  return {
    id: door.id,
    a,
    b,
    w,
    rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
    swingSign: door.swing === "in" ? 1 : -1,
    hinge: door.hinge,
    thickness: host.thickness,
    hostKind: host.hostKind,
    hostId: host.anchor.kind === "room" ? host.anchor.roomId : host.anchor.wallId,
  };
}

/** 点到线段的距离与投影参数 t（0..1）。 */
export function projectOnSegment(p: Pt, a: Pt, b: Pt): { t: number; dist: number; point: Pt } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const point: Pt = [a[0] + dx * t, a[1] + dy * t];
  return { t, dist: Math.hypot(p[0] - point[0], p[1] - point[1]), point };
}

/** 离点最近的可挂门边（在 maxDist 内），并给出沿边的 offset（cm）。 */
export function nearestHostEdge(p: Pt, edges: HostEdge[], maxDist: number, doorWidth = DEFAULT_DOOR_WIDTH): { edge: HostEdge; offset: number; dist: number } | null {
  let best: { edge: HostEdge; offset: number; dist: number } | null = null;
  for (const edge of edges) {
    const len = Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]);
    if (len < doorWidth) continue;
    const { t, dist } = projectOnSegment(p, edge.a, edge.b);
    if (dist > maxDist) continue;
    if (!best || dist < best.dist) {
      const offset = Math.max(0, Math.min(len - doorWidth, t * len - doorWidth / 2));
      best = { edge, offset, dist };
    }
  }
  return best;
}
