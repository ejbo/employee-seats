/**
 * 批量操作（纯函数）：对齐、分布、整组旋转 ±90°、镜像、复制。
 * 房间 / 墙 / 多边形区域按顶点变换；门跟着宿主：宿主变换后按世界位置重新贴到最近的边。
 */
import type { DoorEl, MapElement, RoomEl, SeatEl, ZoneEl } from "./types";
import { ensureClockwise, type Pt } from "./rectilinear";
import { hostEdges, nearestHostEdge, resolveDoor } from "./doors";
import { boundsOf, groupBounds, translateEl, type TransformCtx } from "./transform";
import { nextSeatCode } from "./geometry";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

function isDoor(el: MapElement): el is DoorEl {
  return el.kind === "door";
}

/** 对齐：以整组包围盒为基准。门不参与（跟宿主走）。 */
export function alignElements(els: MapElement[], mode: AlignMode, ctx?: TransformCtx): MapElement[] {
  const targets = els.filter((e) => !isDoor(e));
  const gb = groupBounds(targets, ctx);
  if (!gb || targets.length < 2) return [];
  return targets.map((el) => {
    const b = boundsOf(el, ctx);
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case "left":
        dx = gb.x - b.x;
        break;
      case "hcenter":
        dx = gb.x + gb.w / 2 - (b.x + b.w / 2);
        break;
      case "right":
        dx = gb.x + gb.w - (b.x + b.w);
        break;
      case "top":
        dy = gb.y - b.y;
        break;
      case "vcenter":
        dy = gb.y + gb.h / 2 - (b.y + b.h / 2);
        break;
      case "bottom":
        dy = gb.y + gb.h - (b.y + b.h);
        break;
    }
    return dx || dy ? translateEl(el, dx, dy, ctx) : el;
  });
}

/** 分布：首尾不动，中间元素等间距。 */
export function distributeElements(els: MapElement[], axis: "x" | "y", ctx?: TransformCtx): MapElement[] {
  const targets = els.filter((e) => !isDoor(e));
  if (targets.length < 3) return [];
  const items = targets.map((el) => ({ el, b: boundsOf(el, ctx) })).sort((p, q) => (axis === "x" ? p.b.x - q.b.x : p.b.y - q.b.y));
  const first = items[0].b;
  const last = items[items.length - 1].b;
  const total = axis === "x" ? last.x + last.w - first.x : last.y + last.h - first.y;
  const sizes = items.reduce((s, it) => s + (axis === "x" ? it.b.w : it.b.h), 0);
  const gap = (total - sizes) / (items.length - 1);
  let cursor = axis === "x" ? first.x : first.y;
  return items.map(({ el, b }) => {
    const want = cursor;
    cursor += (axis === "x" ? b.w : b.h) + gap;
    const d = want - (axis === "x" ? b.x : b.y);
    return Math.abs(d) < 0.01 ? el : translateEl(el, axis === "x" ? d : 0, axis === "y" ? d : 0, ctx);
  });
}

type PointMap = (p: Pt) => Pt;

function mapRectEl(el: SeatEl | Extract<MapElement, { kind: "furniture" }>, f: PointMap, rotDelta: number, mirror: boolean): MapElement {
  const c: Pt = [el.x + el.w / 2, el.y + el.h / 2];
  const [cx, cy] = f(c);
  let rotation = mirror ? (360 - el.rotation) % 360 : (el.rotation + rotDelta + 360) % 360;
  rotation = Math.round(rotation * 100) / 100;
  const base = { ...el, x: cx - el.w / 2, y: cy - el.h / 2, rotation };
  if (mirror) {
    if (base.kind === "seat") {
      const style = base.style === "desk-l" ? "desk-l-left" : base.style === "desk-l-left" ? "desk-l" : base.style;
      return { ...base, style };
    }
    return { ...base, flip: !base.flip };
  }
  return base;
}

function mapZone(z: ZoneEl, f: PointMap, rotDelta: number, mirror: boolean): ZoneEl {
  if (z.geometry.type === "polygon") return { ...z, geometry: { type: "polygon", points: z.geometry.points.map(f) } };
  const g = z.geometry;
  const c: Pt = [g.x + g.w / 2, g.y + g.h / 2];
  const [cx, cy] = f(c);
  const rotation = mirror ? (360 - (g.rotation ?? 0)) % 360 : ((g.rotation ?? 0) + rotDelta + 360) % 360;
  return { ...z, geometry: { ...g, x: cx - g.w / 2, y: cy - g.h / 2, rotation } };
}

/** 对一组元素施加刚体 / 镜像变换；门按世界位置重新贴回变换后的宿主边。 */
function transformGroup(els: MapElement[], f: PointMap, rotDelta: number, mirror: boolean, ctx?: TransformCtx): MapElement[] {
  const byId = new Map(els.map((e) => [e.id, e] as const));
  const lookup = (id: string) => byId.get(id) ?? ctx?.byId(id);
  const out: MapElement[] = [];
  const roomsAfter = new Map<string, RoomEl>();
  const doors: DoorEl[] = [];
  for (const el of els) {
    switch (el.kind) {
      case "seat":
      case "furniture":
        out.push(mapRectEl(el, f, rotDelta, mirror));
        break;
      case "label": {
        const [x, y] = f([el.x, el.y]);
        out.push({ ...el, x, y, rotation: mirror ? (360 - el.rotation) % 360 : (el.rotation + rotDelta + 360) % 360 });
        break;
      }
      case "wall":
        out.push({ ...el, points: el.points.map(f) });
        break;
      case "room": {
        const pts = el.points.map(f);
        const room: RoomEl = { ...el, points: mirror ? ensureClockwise(pts) : pts };
        roomsAfter.set(el.id, room);
        out.push(room);
        break;
      }
      case "zone":
        out.push(mapZone(el, f, rotDelta, mirror));
        break;
      case "door":
        doors.push(el);
        break;
    }
  }
  const wallsAfter = new Map(out.filter((e): e is Extract<MapElement, { kind: "wall" }> => e.kind === "wall").map((w) => [w.id, w] as const));
  for (const d of doors) {
    const hostId = d.anchor.kind === "room" ? d.anchor.roomId : d.anchor.wallId;
    const hostAfter = roomsAfter.get(hostId) ?? wallsAfter.get(hostId);
    if (!hostAfter) {
      out.push(d); // 宿主没动：门也不动
      continue;
    }
    const geom = resolveDoor(d, lookup);
    if (!geom) continue;
    const mid = f([(geom.a[0] + geom.b[0]) / 2, (geom.a[1] + geom.b[1]) / 2]);
    const hit = nearestHostEdge(mid, hostEdges([hostAfter]), 60, d.w);
    if (!hit) continue;
    out.push({ ...d, anchor: hit.edge.anchor, offset: hit.offset, hinge: mirror ? (d.hinge === "start" ? "end" : "start") : d.hinge });
  }
  return out;
}

/** 整组绕包围盒中心旋转 ±90°（屏幕坐标 y 向下：+90 为顺时针）。 */
export function rotateGroup(els: MapElement[], deg: 90 | -90, ctx?: TransformCtx): MapElement[] {
  const gb = groupBounds(els.filter((e) => !isDoor(e)), ctx);
  if (!gb) return [];
  const cx = gb.x + gb.w / 2;
  const cy = gb.y + gb.h / 2;
  const f: PointMap = deg === 90 ? ([x, y]) => [cx - (y - cy), cy + (x - cx)] : ([x, y]) => [cx + (y - cy), cy - (x - cx)];
  return transformGroup(els, f, deg, false, ctx);
}

/** 整组镜像（axis = "x" 左右翻转）。 */
export function flipGroup(els: MapElement[], axis: "x" | "y", ctx?: TransformCtx): MapElement[] {
  const gb = groupBounds(els.filter((e) => !isDoor(e)), ctx);
  if (!gb) return [];
  const cx = gb.x + gb.w / 2;
  const cy = gb.y + gb.h / 2;
  const f: PointMap = axis === "x" ? ([x, y]) => [2 * cx - x, y] : ([x, y]) => [x, 2 * cy - y];
  // 上下镜像等价于左右镜像 + 旋转 180°，这里统一按“镜像 + 旋转修正”处理
  const out = transformGroup(els, f, 0, true, ctx);
  if (axis === "y") {
    return out.map((el) => {
      if (el.kind === "seat" || el.kind === "furniture" || el.kind === "label") return { ...el, rotation: (el.rotation + 180) % 360 };
      if (el.kind === "zone" && el.geometry.type === "rect") return { ...el, geometry: { ...el.geometry, rotation: ((el.geometry.rotation ?? 0) + 180) % 360 } };
      return el;
    });
  }
  return out;
}

/** 复制：新 id、座位重编号并清空占用者、门只在宿主一起复制时保留并挂到新宿主。 */
export function duplicateElements(els: MapElement[], dx: number, dy: number, existingCodes: Set<string>, ctx?: TransformCtx): MapElement[] {
  return duplicateWithMap(els, dx, dy, existingCodes, ctx).items;
}

export function duplicateWithMap(els: MapElement[], dx: number, dy: number, existingCodes: Set<string>, ctx?: TransformCtx): { items: MapElement[]; idMap: Map<string, string> } {
  const idMap = new Map(els.map((e) => [e.id, crypto.randomUUID()] as const));
  const codes = new Set(existingCodes);
  const out: MapElement[] = [];
  for (const el of els) {
    if (el.kind === "door") {
      const hostId = el.anchor.kind === "room" ? el.anchor.roomId : el.anchor.wallId;
      const newHost = idMap.get(hostId);
      if (!newHost) continue;
      const anchor = el.anchor.kind === "room" ? { ...el.anchor, roomId: newHost } : { ...el.anchor, wallId: newHost };
      out.push({ ...el, id: idMap.get(el.id)!, anchor });
      continue;
    }
    const moved = translateEl(el, dx, dy, ctx);
    if (moved.kind === "seat") {
      const code = nextSeatCode(codes, moved.code.replace(/\d+$/, "") || "S");
      codes.add(code);
      out.push({ ...moved, id: idMap.get(el.id)!, code, employeeId: null });
    } else if (moved.kind === "zone") {
      out.push({ ...moved, id: idMap.get(el.id)!, name: `${moved.name} 副本` });
    } else {
      out.push({ ...moved, id: idMap.get(el.id)! });
    }
  }
  return { items: out, idMap };
}

