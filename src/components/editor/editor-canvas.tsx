"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import type { DepartmentSummary, DoorAnchor, DoorEl, EmployeeSummary, MapElement, RoomEl, SeatEl, ZoneEl } from "@/lib/map/types";
import { DEFAULT_DOOR_WIDTH, DEFAULT_SEAT_SIZE } from "@/lib/map/types";
import { angleFromCenter, boundsIntersect, elementBounds, nextSeatCode, normalizeAngle, rectTransform, resizeRect, snap, type Bounds, type Handle } from "@/lib/map/geometry";
import { centerOf, pointsOf, rectOf, rotationOf, translateEl, withRect, withRotation, withVertexAt, type TransformCtx } from "@/lib/map/transform";
import { hostEdges, nearestHostEdge, resolveDoor } from "@/lib/map/doors";
import { deriveWalls } from "@/lib/map/walls";
import { rectToPoints } from "@/lib/map/rectilinear";
import { catalogDef } from "@/lib/map/catalog";
import { useViewport } from "@/hooks/use-viewport";
import { redo, undo, useEditorStore, type Tool } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { BlueprintDefs, DoorGlyph, LabelText, ObjectGlyph, SeatGlyph, ZoneShape, type Lod } from "@/components/map2d/glyphs";
import { BlueprintPaper, RoomFloors, RoomLabels, WallsAndDoors } from "@/components/map2d/blueprint-layers";
import { Rulers, RULER_SIZE } from "./rulers";
import { DimensionOverlay } from "./dimension-overlay";

type Pt = { x: number; y: number };

type Gesture =
  | { type: "pan"; pan: { move: (x: number, y: number) => void; end: () => void } }
  | { type: "marquee"; start: Pt; current: Pt; additive: boolean; startClient: Pt }
  | { type: "move"; ids: string[]; start: Pt; startClient: Pt; origin: Record<string, MapElement>; moved: boolean }
  | { type: "resize"; id: string; handle: Handle; start: Pt; origin: MapElement }
  | { type: "rotate"; id: string; center: Pt; origin: MapElement }
  | { type: "vertex"; id: string; index: number; origin: MapElement }
  | { type: "draw"; kind: "zone" | "room"; start: Pt; current: Pt };

interface DoorCandidate {
  anchor: DoorAnchor;
  offset: number;
}

interface Overlay {
  overrides: Record<string, MapElement>;
  marquee: Bounds | null;
  draw: Bounds | null;
  cursor: Pt | null;
  door: DoorCandidate | null;
}

const EMPTY_OVERLAY: Overlay = { overrides: {}, marquee: null, draw: null, cursor: null, door: null };
/** 工具栏在左、属性面板在右：适应窗口时避开它们 */
const EDITOR_INSET = { left: 64, right: 340, top: 40 + RULER_SIZE, bottom: 0 };
const TOOL_KEYS: Record<string, Tool> = { v: "select", s: "seat", r: "room", z: "zone", w: "wall", d: "door", t: "label", f: "furniture", b: "image" };
const MIN_ROOM = 100;

function normRect(a: Pt, b: Pt): Bounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function hostOf(door: DoorEl): string {
  return door.anchor.kind === "room" ? door.anchor.roomId : door.anchor.wallId;
}

/** 整组平移：门若和宿主一起被选中，就跟着宿主走，不再单独沿边滑动。 */
function moveGroup(ids: string[], origin: Record<string, MapElement>, dx: number, dy: number, byId: (id: string) => MapElement | undefined): Record<string, MapElement> {
  const out: Record<string, MapElement> = {};
  const set = new Set(ids);
  const ctx: TransformCtx = { byId };
  for (const id of ids) {
    const el = origin[id];
    if (!el) continue;
    if (el.kind === "door" && set.has(hostOf(el))) {
      out[id] = el;
      continue;
    }
    out[id] = translateEl(el, dx, dy, ctx);
  }
  return out;
}

export interface EditorCanvasProps {
  employees: Record<string, EmployeeSummary>;
  departments: Record<string, DepartmentSummary>;
  /** 物件工具当前选中的物件库 key */
  furnitureType: string;
  showGrid: boolean;
  onToggleGrid: () => void;
  onSaveNow: () => void;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

export function EditorCanvas({ employees, departments, furnitureType, showGrid, onToggleGrid, onSaveNow, svgRef }: EditorCanvasProps) {
  const vp = useViewport();
  const { transform, containerRef, fitToBounds, zoomBy, beginPan, screenToWorld, size } = vp;
  const elements = useEditorStore((s) => s.elements);
  const order = useEditorStore((s) => s.order);
  const meta = useEditorStore((s) => s.meta);
  const selection = useEditorStore((s) => s.selection);
  const tool = useEditorStore((s) => s.tool);
  const { select, add, patchMany, setTool } = useEditorStore.getState();

  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY);
  const [wallDraft, setWallDraft] = useState<[number, number][]>([]);
  const gestureRef = useRef<Gesture | null>(null);
  const spaceRef = useRef(false);
  const fittedRef = useRef(false);
  const floorId = useEditorStore((s) => s.floorId);

  const grid = meta.gridSize;
  const floorBounds = useMemo(() => ({ x: 0, y: 0, w: meta.width, h: meta.height }), [meta.width, meta.height]);

  useEffect(() => {
    if (!size.w || !size.h || fittedRef.current) return;
    fittedRef.current = true;
    fitToBounds(floorBounds, 32, false, EDITOR_INSET);
  }, [fitToBounds, floorBounds, size.h, size.w]);
  useEffect(() => {
    fittedRef.current = false;
  }, [floorId]);

  const k = transform.k;
  const lod: Lod = k < 0.6 ? 0 : k < 1.1 ? 1 : 2;
  const handleSize = 9 / k;

  // 显示中的元素 = 已提交 + 拖拽中的临时覆盖；门的世界几何由宿主边解析
  const displayElements = useMemo(
    () => (Object.keys(overlay.overrides).length ? { ...elements, ...overlay.overrides } : elements),
    [elements, overlay.overrides],
  );
  const displayEl = useCallback((id: string): MapElement | undefined => displayElements[id], [displayElements]);
  const derived = useMemo(() => deriveWalls(Object.values(displayElements)), [displayElements]);
  const doorGeoms = useMemo(() => new Map(derived.doors.map((g) => [g.id, g] as const)), [derived.doors]);
  const ctx = useMemo<TransformCtx>(() => ({ byId: displayEl, doorGeoms }), [displayEl, doorGeoms]);
  const edges = useMemo(() => (tool === "door" ? hostEdges(Object.values(elements)) : []), [elements, tool]);

  const snapPt = useCallback((p: Pt, free = false): Pt => (free ? p : { x: snap(p.x, grid), y: snap(p.y, grid) }), [grid]);

  const seatCodes = useMemo(() => new Set(Object.values(elements).filter((e): e is SeatEl => e.kind === "seat").map((e) => e.code)), [elements]);
  const objectDef = useMemo(() => catalogDef(furnitureType), [furnitureType]);

  // ── 指针 ────────────────────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as Element;
      if (target.closest("[data-ui]")) return;
      const world = screenToWorld(e.clientX, e.clientY);
      const container = e.currentTarget as HTMLElement;

      if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
        container.setPointerCapture(e.pointerId);
        gestureRef.current = { type: "pan", pan: beginPan(e.clientX, e.clientY) };
        return;
      }
      if (e.button !== 0) return;

      if (tool === "select") {
        container.setPointerCapture(e.pointerId);
        const handle = (target.closest("[data-handle]") as HTMLElement | null)?.dataset.handle as Handle | undefined;
        const rotate = target.closest("[data-rotate]");
        const vertex = (target.closest("[data-vertex]") as HTMLElement | null)?.dataset.vertex;
        const single = selection.length === 1 ? elements[selection[0]] : undefined;
        if (single && handle) {
          gestureRef.current = { type: "resize", id: single.id, handle, start: world, origin: single };
          return;
        }
        if (single && rotate) {
          gestureRef.current = { type: "rotate", id: single.id, center: centerOf(single, ctx), origin: single };
          return;
        }
        if (single && vertex !== undefined) {
          gestureRef.current = { type: "vertex", id: single.id, index: Number(vertex), origin: single };
          return;
        }
        const elId = (target.closest("[data-id]") as HTMLElement | null)?.dataset.id;
        if (elId && elements[elId]) {
          let ids: string[];
          if (e.shiftKey) {
            ids = selection.includes(elId) ? selection.filter((x) => x !== elId) : [...selection, elId];
            select(ids);
          } else {
            ids = selection.includes(elId) ? selection : [elId];
            if (!selection.includes(elId)) select(ids);
          }
          const origin: Record<string, MapElement> = {};
          for (const id of ids) if (elements[id]) origin[id] = elements[id];
          gestureRef.current = { type: "move", ids, start: world, startClient: { x: e.clientX, y: e.clientY }, origin, moved: false };
          return;
        }
        gestureRef.current = { type: "marquee", start: world, current: world, additive: e.shiftKey, startClient: { x: e.clientX, y: e.clientY } };
        return;
      }

      if (tool === "seat") {
        const p = snapPt({ x: world.x - DEFAULT_SEAT_SIZE.w / 2, y: world.y - DEFAULT_SEAT_SIZE.h / 2 }, e.altKey);
        add({ kind: "seat", id: crypto.randomUUID(), code: nextSeatCode(seatCodes), x: p.x, y: p.y, w: DEFAULT_SEAT_SIZE.w, h: DEFAULT_SEAT_SIZE.h, rotation: 0, zoneId: null, status: "ACTIVE", note: "", employeeId: null, style: "desk-basic" });
        return;
      }
      if (tool === "furniture") {
        const p = snapPt({ x: world.x - objectDef.w / 2, y: world.y - objectDef.d / 2 }, e.altKey);
        add({ kind: "furniture", id: crypto.randomUUID(), typeKey: objectDef.key, typeId: null, x: p.x, y: p.y, w: objectDef.w, h: objectDef.d, rotation: 0, name: "", flip: false });
        if (!e.shiftKey) setTool("select");
        return;
      }
      if (tool === "door") {
        const c = overlay.door;
        if (!c) {
          toast.message("把门放到房间边或墙上", { description: "移动到房间的边或墙段附近，再点击放置" });
          return;
        }
        add({ kind: "door", id: crypto.randomUUID(), anchor: c.anchor, offset: c.offset, w: DEFAULT_DOOR_WIDTH, swing: "in", hinge: "start" });
        return;
      }
      if (tool === "label") {
        const p = snapPt(world, e.altKey);
        add({ kind: "label", id: crypto.randomUUID(), x: p.x, y: p.y, rotation: 0, text: "文字", fontSize: 28, color: null });
        setTool("select");
        return;
      }
      if (tool === "wall") {
        const p = snapPt(world, e.altKey);
        setWallDraft((d) => {
          const last = d[d.length - 1];
          if (last && Math.hypot(last[0] - p.x, last[1] - p.y) < grid / 2) return d; // 同一点：交给双击结束
          return [...d, [p.x, p.y]];
        });
        return;
      }
      if (tool === "zone" || tool === "room") {
        container.setPointerCapture(e.pointerId);
        const p = snapPt(world, e.altKey);
        gestureRef.current = { type: "draw", kind: tool, start: p, current: p };
        return;
      }
    },
    [add, beginPan, ctx, elements, grid, objectDef, overlay.door, screenToWorld, seatCodes, select, selection, setTool, snapPt, tool],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const world = screenToWorld(e.clientX, e.clientY);
      const g = gestureRef.current;
      if (!g) {
        if (tool === "door") {
          const hit = nearestHostEdge([world.x, world.y], edges, 16 / k, DEFAULT_DOOR_WIDTH);
          const next: DoorCandidate | null = hit ? { anchor: hit.edge.anchor, offset: e.altKey ? hit.offset : Math.max(0, snap(hit.offset, grid / 2)) } : null;
          setOverlay((o) => (o.door === next || (o.door && next && o.door.offset === next.offset && JSON.stringify(o.door.anchor) === JSON.stringify(next.anchor)) ? o : { ...o, door: next }));
          return;
        }
        if (tool === "seat" || tool === "furniture" || tool === "label" || tool === "wall") {
          const p = snapPt(world, e.altKey);
          setOverlay((o) => (o.cursor && o.cursor.x === p.x && o.cursor.y === p.y ? o : { ...o, cursor: p }));
        }
        return;
      }
      switch (g.type) {
        case "pan":
          g.pan.move(e.clientX, e.clientY);
          return;
        case "marquee": {
          g.current = world;
          setOverlay((o) => ({ ...o, marquee: normRect(g.start, g.current) }));
          return;
        }
        case "move": {
          if (!g.moved && Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y) < 3) return;
          g.moved = true;
          const dx = world.x - g.start.x;
          const dy = world.y - g.start.y;
          const sdx = e.altKey ? dx : snap(dx, grid);
          const sdy = e.altKey ? dy : snap(dy, grid);
          const overrides = moveGroup(g.ids, g.origin, sdx, sdy, (id) => g.origin[id] ?? elements[id]);
          setOverlay((o) => ({ ...o, overrides }));
          return;
        }
        case "resize": {
          const r = rectOf(g.origin);
          if (!r) return;
          const next = resizeRect(r, g.handle, world.x - g.start.x, world.y - g.start.y, Math.max(10, grid), e.altKey ? 0 : grid);
          setOverlay((o) => ({ ...o, overrides: { [g.id]: withRect(g.origin, next) } }));
          return;
        }
        case "rotate": {
          const raw = angleFromCenter(g.center.x, g.center.y, world.x, world.y);
          const angle = normalizeAngle(e.shiftKey ? raw : Math.round(raw / 15) * 15);
          setOverlay((o) => ({ ...o, overrides: { [g.id]: withRotation(g.origin, angle) } }));
          return;
        }
        case "vertex": {
          const p = snapPt(world, e.altKey);
          setOverlay((o) => ({ ...o, overrides: { [g.id]: withVertexAt(g.origin, g.index, p.x, p.y) } }));
          return;
        }
        case "draw": {
          g.current = snapPt(world, e.altKey);
          setOverlay((o) => ({ ...o, draw: normRect(g.start, g.current) }));
          return;
        }
      }
    },
    [edges, elements, grid, k, screenToWorld, snapPt, tool],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g) return;
      const world = screenToWorld(e.clientX, e.clientY);
      switch (g.type) {
        case "pan":
          g.pan.end();
          return;
        case "marquee": {
          const rect = normRect(g.start, world);
          if (rect.w > 2 / k && rect.h > 2 / k) {
            const hit = Object.values(elements)
              .filter((el) => boundsIntersect(rect, elementBounds(el, doorGeoms)))
              .map((el) => el.id);
            select(g.additive ? Array.from(new Set([...selection, ...hit])) : hit);
          }
          setOverlay((o) => ({ ...o, marquee: null }));
          return;
        }
        case "move": {
          if (g.moved) {
            const dx = world.x - g.start.x;
            const dy = world.y - g.start.y;
            const sdx = e.altKey ? dx : snap(dx, grid);
            const sdy = e.altKey ? dy : snap(dy, grid);
            if (sdx !== 0 || sdy !== 0) {
              const moved = moveGroup(g.ids, g.origin, sdx, sdy, (id) => g.origin[id] ?? elements[id]);
              patchMany(g.ids, (el) => moved[el.id] ?? el);
            }
          }
          setOverlay((o) => ({ ...o, overrides: {} }));
          return;
        }
        case "resize":
        case "rotate":
        case "vertex": {
          const next = overlay.overrides[g.id];
          if (next) patchMany([g.id], () => next);
          setOverlay((o) => ({ ...o, overrides: {} }));
          return;
        }
        case "draw": {
          const rect = normRect(g.start, g.current);
          setOverlay((o) => ({ ...o, draw: null }));
          if (g.kind === "zone") {
            if (rect.w < grid || rect.h < grid) return;
            const zoneCount = Object.values(elements).filter((el) => el.kind === "zone").length;
            const zone: ZoneEl = { kind: "zone", id: crypto.randomUUID(), name: `区域 ${zoneCount + 1}`, departmentId: null, color: null, geometry: { type: "rect", ...rect }, sortOrder: zoneCount };
            add(zone);
          } else {
            if (rect.w < MIN_ROOM || rect.h < MIN_ROOM) {
              if (rect.w > grid || rect.h > grid) toast.message("房间至少 1 × 1 m");
              return;
            }
            const roomCount = Object.values(elements).filter((el) => el.kind === "room").length;
            const room: RoomEl = { kind: "room", id: crypto.randomUUID(), name: `房间 ${roomCount + 1}`, type: "office", points: rectToPoints(rect.x, rect.y, rect.w, rect.h), floorStyle: null, wallHeight: null };
            add(room);
          }
          setTool("select");
          return;
        }
      }
    },
    [add, doorGeoms, elements, grid, k, overlay.overrides, patchMany, screenToWorld, select, selection, setTool],
  );

  const finishWall = useCallback(() => {
    setWallDraft((d) => {
      if (d.length >= 2) add({ kind: "wall", id: crypto.randomUUID(), points: d, thickness: 15 });
      return [];
    });
  }, [add]);

  // ── 键盘 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const st = useEditorStore.getState();
      if (e.code === "Space") {
        spaceRef.current = true;
        e.preventDefault();
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === "s") {
        e.preventDefault();
        onSaveNow();
        return;
      }
      if (mod && key === "a") {
        e.preventDefault();
        st.select(Object.keys(st.elements));
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        if (st.selection.length === 0) return;
        const codes = new Set(Object.values(st.elements).filter((el): el is SeatEl => el.kind === "seat").map((el) => el.code));
        const copies: MapElement[] = [];
        const idMap = new Map<string, string>();
        for (const id of st.selection) idMap.set(id, crypto.randomUUID());
        const byId = (id: string) => st.elements[id];
        for (const id of st.selection) {
          const el = st.elements[id];
          if (!el) continue;
          if (el.kind === "door") {
            // 门只有在宿主一起复制时才复制（挂到新宿主上）
            const newHost = idMap.get(hostOf(el));
            if (!newHost) continue;
            const anchor: DoorAnchor = el.anchor.kind === "room" ? { ...el.anchor, roomId: newHost } : { ...el.anchor, wallId: newHost };
            copies.push({ ...el, id: idMap.get(id)!, anchor });
            continue;
          }
          const moved = translateEl(el, st.meta.gridSize * 2, st.meta.gridSize * 2, { byId });
          if (moved.kind === "seat") {
            const code = nextSeatCode(codes, moved.code.replace(/\d+$/, "") || "S");
            codes.add(code);
            copies.push({ ...moved, id: idMap.get(id)!, code, employeeId: null });
          } else {
            copies.push({ ...moved, id: idMap.get(id)! });
          }
        }
        st.addMany(copies);
        return;
      }
      if (e.key === "Escape") {
        if (wallDraft.length) setWallDraft([]);
        else if (st.tool !== "select") st.setTool("select");
        else st.clearSelection();
        return;
      }
      if (e.key === "Enter" && st.tool === "wall") {
        finishWall();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (st.selection.length === 0) return;
        e.preventDefault();
        const occupied = st.selection.filter((id) => st.elements[id]?.kind === "seat" && (st.elements[id] as SeatEl).employeeId);
        if (occupied.length) toast.error(`${occupied.length} 个座位上有人，请先释放再删除`);
        const deletable = st.selection.filter((id) => !occupied.includes(id));
        if (deletable.length) st.remove(deletable);
        return;
      }
      if (e.key.startsWith("Arrow")) {
        if (st.selection.length === 0) return;
        e.preventDefault();
        const step = st.meta.gridSize * (e.shiftKey ? 5 : 1);
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const origin: Record<string, MapElement> = {};
        for (const id of st.selection) if (st.elements[id]) origin[id] = st.elements[id];
        const moved = moveGroup(st.selection, origin, dx, dy, (id) => st.elements[id]);
        st.patchMany(st.selection, (el) => moved[el.id] ?? el);
        return;
      }
      if (!mod && e.shiftKey && key === "r" && st.selection.length) {
        st.patchMany(st.selection, (el) => {
          const r = rotationOf(el);
          return r === null ? el : withRotation(el, normalizeAngle(r + 90));
        });
        return;
      }
      if (!mod && key === "x" && st.selection.length) {
        const doors = st.selection.filter((id) => st.elements[id]?.kind === "door");
        if (!doors.length) return;
        st.patchMany(doors, (el) =>
          el.kind !== "door" ? el : e.shiftKey ? { ...el, hinge: el.hinge === "start" ? "end" : "start" } : { ...el, swing: el.swing === "in" ? "out" : "in" },
        );
        return;
      }
      if (!mod && key === "g") {
        onToggleGrid();
        return;
      }
      if (!mod && !e.shiftKey && TOOL_KEYS[key]) {
        st.setTool(TOOL_KEYS[key]);
        return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [finishWall, onSaveNow, onToggleGrid, wallDraft.length]);

  // ── 渲染 ────────────────────────────────────────────────────────────────
  const zones = useMemo(
    () =>
      Object.values(elements)
        .filter((el): el is ZoneEl => el.kind === "zone")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [elements],
  );
  const seats = useMemo(() => Object.values(elements).filter((el): el is SeatEl => el.kind === "seat"), [elements]);
  const displayRooms = useMemo(() => order.map((id) => displayElements[id]).filter((el): el is RoomEl => el?.kind === "room"), [displayElements, order]);
  const decorIds = useMemo(() => order.filter((id) => elements[id] && elements[id].kind !== "room" && elements[id].kind !== "door"), [elements, order]);
  const selected = useMemo(() => new Set(selection), [selection]);
  const single = selection.length === 1 ? displayEl(selection[0]) : undefined;
  const singleRect = single ? rectOf(single) : null;
  const singlePoints = single ? pointsOf(single) : null;
  const cursorClass = tool === "select" ? "cursor-default" : tool === "image" ? "cursor-default" : "cursor-crosshair";
  const previewDoor = useMemo(() => {
    if (!overlay.door) return null;
    const d: DoorEl = { kind: "door", id: "preview", anchor: overlay.door.anchor, offset: overlay.door.offset, w: DEFAULT_DOOR_WIDTH, swing: "in", hinge: "start" };
    return resolveDoor(d, (id) => elements[id]);
  }, [elements, overlay.door]);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full touch-none select-none overflow-hidden bg-map-canvas ${cursorClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setOverlay((o) => (o.cursor || o.door ? { ...o, cursor: null, door: null } : o))}
      onDoubleClick={(e) => {
        if (tool === "wall") {
          e.preventDefault();
          finishWall();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg ref={svgRef} className="block h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <BlueprintDefs k={k} />
        </defs>
        <g data-map-root transform={`translate(${transform.x} ${transform.y}) scale(${k})`}>
          <BlueprintPaper
            width={meta.width}
            height={meta.height}
            gridSize={grid}
            k={k}
            showGrid={showGrid}
            background={meta.backgroundKey && meta.background ? { key: meta.backgroundKey, ...meta.background } : null}
            idPrefix="editor"
          />

          {/* 房间地面（最底层） */}
          <RoomFloors
            rooms={displayRooms}
            k={k}
            selectedIds={selected}
            wrap={(room, node) => (
              <g key={room.id} data-id={room.id} className="cursor-move">
                {node}
              </g>
            )}
          />

          {zones.map((z) => {
            const el = (displayEl(z.id) as ZoneEl) ?? z;
            return (
              <g key={z.id} data-id={z.id}>
                <ZoneShape zone={el} departments={departments} dimmed={false} selected={selected.has(z.id)} interactive k={k} />
              </g>
            );
          })}

          {/* 墙（合并 path）+ 门 */}
          <WallsAndDoors
            derived={derived}
            k={k}
            selectedIds={selected}
            wrapDoor={(id, node) => (
              <g key={id} data-id={id} className="cursor-move">
                {node}
              </g>
            )}
          />

          {decorIds.map((id) => {
            const el = displayEl(id);
            if (!el) return null;
            const sel = selected.has(id);
            switch (el.kind) {
              case "wall": {
                // 墙本体已合并进 path；这里只放命中区域与选中高亮
                const pts = el.points.map((p) => p.join(",")).join(" ");
                return (
                  <g key={id} data-id={id} className="cursor-move">
                    {sel && <polyline points={pts} fill="none" stroke="var(--info)" strokeOpacity={0.5} strokeWidth={el.thickness + 12} strokeLinejoin="round" strokeLinecap="round" />}
                    <polyline points={pts} fill="none" stroke="transparent" strokeWidth={Math.max(el.thickness, 8 / k) + 8 / k} strokeLinejoin="round" strokeLinecap="square" />
                  </g>
                );
              }
              case "furniture":
                return (
                  <g key={id} data-id={id} className="cursor-move">
                    <ObjectGlyph item={el} selected={sel} lod={lod} k={k} />
                  </g>
                );
              case "label":
                return (
                  <g key={id} data-id={id} className="cursor-move">
                    <LabelText label={el} selected={sel} />
                  </g>
                );
              default:
                return null;
            }
          })}

          {seats.map((s) => {
            const el = (displayEl(s.id) as SeatEl) ?? s;
            const emp = el.employeeId ? (employees[el.employeeId] ?? null) : null;
            const dept = emp?.departmentId ? (departments[emp.departmentId] ?? null) : null;
            return (
              <g key={s.id} data-id={s.id} className="cursor-move">
                <SeatGlyph seat={el} employee={emp} department={dept} lod={lod} hovered={false} selected={selected.has(s.id)} dimmed={false} />
              </g>
            );
          })}

          <RoomLabels rooms={displayRooms} k={k} />

          {/* 墙体草稿 */}
          {wallDraft.length > 0 && (
            <g style={{ pointerEvents: "none" }}>
              <polyline points={[...wallDraft, ...(overlay.cursor ? [[overlay.cursor.x, overlay.cursor.y]] : [])].map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--info)" strokeWidth={15} strokeOpacity={0.5} strokeLinejoin="round" strokeLinecap="round" />
              {wallDraft.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={6 / k} fill="var(--info)" />
              ))}
            </g>
          )}

          {/* 放置预览 */}
          {overlay.cursor && tool === "seat" && (
            <rect x={overlay.cursor.x} y={overlay.cursor.y} width={DEFAULT_SEAT_SIZE.w} height={DEFAULT_SEAT_SIZE.h} rx={8} fill="var(--info)" fillOpacity={0.15} stroke="var(--info)" strokeDasharray="6 4" style={{ pointerEvents: "none" }} />
          )}
          {overlay.cursor && tool === "furniture" && (
            <g style={{ pointerEvents: "none" }} opacity={0.55}>
              <ObjectGlyph item={{ kind: "furniture", id: "preview", typeKey: objectDef.key, typeId: null, x: overlay.cursor.x - objectDef.w / 2, y: overlay.cursor.y - objectDef.d / 2, w: objectDef.w, h: objectDef.d, rotation: 0, name: "", flip: false }} def={objectDef} lod={lod} k={k} />
            </g>
          )}
          {tool === "door" && previewDoor && (
            <g style={{ pointerEvents: "none" }} opacity={0.7}>
              <DoorGlyph geom={previewDoor} k={k} />
            </g>
          )}
          {overlay.draw && (
            <g style={{ pointerEvents: "none" }}>
              <rect x={overlay.draw.x} y={overlay.draw.y} width={overlay.draw.w} height={overlay.draw.h} rx={tool === "zone" ? 12 : 0} fill="var(--info)" fillOpacity={0.12} stroke="var(--info)" strokeWidth={2 / k} strokeDasharray={`${8 / k} ${6 / k}`} />
              {tool === "room" && (
                <text x={overlay.draw.x + overlay.draw.w / 2} y={overlay.draw.y - 8 / k} textAnchor="middle" fontSize={13 / k} fill="var(--info)" fontFamily="var(--font-mono)">
                  {(overlay.draw.w / 100).toFixed(2)} × {(overlay.draw.h / 100).toFixed(2)} m
                </text>
              )}
            </g>
          )}

          {/* 选择框与把手 */}
          {selection.map((id) => {
            const el = displayEl(id);
            if (!el) return null;
            const r = rectOf(el);
            if (r) {
              return (
                <rect key={id} transform={rectTransform(r.x, r.y, r.w, r.h, r.rotation)} width={r.w} height={r.h} fill="none" stroke="var(--info)" strokeWidth={1.5 / k} strokeDasharray={selection.length > 1 ? `${6 / k} ${4 / k}` : undefined} style={{ pointerEvents: "none" }} />
              );
            }
            if (el.kind === "room") {
              return <polygon key={id} points={el.points.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--info)" strokeWidth={2 / k} strokeDasharray={selection.length > 1 ? `${6 / k} ${4 / k}` : undefined} style={{ pointerEvents: "none" }} />;
            }
            if (el.kind === "door") return null; // 门自带选中框
            const b = elementBounds(el, doorGeoms);
            return <rect key={id} x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} fill="none" stroke="var(--info)" strokeWidth={1.5 / k} strokeDasharray={`${6 / k} ${4 / k}`} style={{ pointerEvents: "none" }} />;
          })}
          {single && <DimensionOverlay el={single} k={k} />}
          {single && singleRect && (
            <g transform={rectTransform(singleRect.x, singleRect.y, singleRect.w, singleRect.h, singleRect.rotation)}>
              {(
                [
                  ["nw", 0, 0],
                  ["n", singleRect.w / 2, 0],
                  ["ne", singleRect.w, 0],
                  ["e", singleRect.w, singleRect.h / 2],
                  ["se", singleRect.w, singleRect.h],
                  ["s", singleRect.w / 2, singleRect.h],
                  ["sw", 0, singleRect.h],
                  ["w", 0, singleRect.h / 2],
                ] as [Handle, number, number][]
              ).map(([h, hx, hy]) => (
                <rect
                  key={h}
                  data-handle={h}
                  x={hx - handleSize / 2}
                  y={hy - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill="var(--surface)"
                  stroke="var(--info)"
                  strokeWidth={1.5 / k}
                  style={{ cursor: `${h}-resize` }}
                />
              ))}
              <line x1={singleRect.w / 2} y1={0} x2={singleRect.w / 2} y2={-28 / k} stroke="var(--info)" strokeWidth={1.5 / k} />
              <circle data-rotate cx={singleRect.w / 2} cy={-28 / k} r={handleSize * 0.6} fill="var(--surface)" stroke="var(--info)" strokeWidth={1.5 / k} style={{ cursor: "grab" }} />
            </g>
          )}
          {single && single.kind === "label" && (
            <g transform={`translate(${single.x} ${single.y}) rotate(${single.rotation})`}>
              <circle data-rotate cx={0} cy={-single.fontSize - 24 / k} r={handleSize * 0.6} fill="var(--surface)" stroke="var(--info)" strokeWidth={1.5 / k} style={{ cursor: "grab" }} />
            </g>
          )}
          {single && singlePoints && singlePoints.map(([x, y], i) => (
            <circle key={i} data-vertex={i} cx={x} cy={y} r={handleSize * 0.6} fill="var(--surface)" stroke="var(--info)" strokeWidth={1.5 / k} style={{ cursor: "move" }} />
          ))}
          {overlay.marquee && (
            <rect x={overlay.marquee.x} y={overlay.marquee.y} width={overlay.marquee.w} height={overlay.marquee.h} fill="var(--info)" fillOpacity={0.08} stroke="var(--info)" strokeWidth={1 / k} style={{ pointerEvents: "none" }} />
          )}
        </g>
      </svg>
      <Rulers transform={transform} size={size} containerRef={containerRef} />

      <div data-ui className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-xl border border-border bg-surface/90 p-1 shadow-lift backdrop-blur">
        <Button variant="ghost" size="icon-sm" aria-label="放大" onClick={() => zoomBy(1.4)}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="缩小" onClick={() => zoomBy(1 / 1.4)}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="适应窗口" onClick={() => fitToBounds(floorBounds, 32, true, EDITOR_INSET)}>
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
      <div data-ui className="pointer-events-none absolute bottom-3 left-14 rounded-md bg-surface/80 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur">
        {Math.round(k * 100)}% · {Math.round(meta.width / 100)}×{Math.round(meta.height / 100)} m
        {tool === "wall" && <span className="ml-2 text-info">墙体：逐点点击，回车 / 双击结束，Esc 取消</span>}
        {tool === "room" && <span className="ml-2 text-info">拖出房间范围（至少 1 × 1 m）</span>}
        {tool === "door" && <span className="ml-2 text-info">移到房间边或墙上点击放置 · 选中后 X 换开向、⇧X 换铰链</span>}
        {tool === "furniture" && <span className="ml-2 text-info">点击放置：{objectDef.name}（按住 ⇧ 连续放置）</span>}
        {tool === "zone" && <span className="ml-2 text-info">拖出区域范围</span>}
      </div>
    </div>
  );
}
