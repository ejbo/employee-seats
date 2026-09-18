"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import type { DepartmentSummary, DoorAnchor, DoorEl, EmployeeSummary, MapElement, RoomEl, SeatEl, SeatStyle, ZoneEl } from "@/lib/map/types";
import { DEFAULT_DOOR_WIDTH } from "@/lib/map/types";
import { angleFromCenter, boundsIntersect, elementBounds, nextSeatCode, normalizeAngle, rectTransform, resizeRect, snap, type Bounds, type Handle } from "@/lib/map/geometry";
import { centerOf, groupBounds, pointsOf, rectOf, rotationOf, translateEl, withRect, withRotation, withVertexAt, type TransformCtx } from "@/lib/map/transform";
import { collectCandidates, snapAngle, snapMove, snapPoint, snapValue, type Guide, type SnapCandidate } from "@/lib/map/snap";
import { hostEdges, nearestHostEdge, resolveDoor } from "@/lib/map/doors";
import { deriveWalls } from "@/lib/map/walls";
import { rectToPoints, roomEdges, moveRoomEdge, unionRectilinear, type Pt as RPt } from "@/lib/map/rectilinear";
import { elementsInRoom, overlappingRooms, reanchorDoors } from "@/lib/map/rooms";
import { alignElements, distributeElements, duplicateWithMap, flipGroup, rotateGroup, type AlignMode } from "@/lib/map/batch";
import { useClipboardStore } from "@/stores/clipboard-store";
import { SelectionToolbar, type SelectionToolbarActions } from "./selection-toolbar";
import { catalogDef, SEAT_PRESET_BY_STYLE } from "@/lib/map/catalog";
import { useLibraryDragStore } from "@/stores/library-drag-store";
import { useViewport } from "@/hooks/use-viewport";
import { redo, undo, useEditorStore, type Tool } from "@/stores/editor-store";
import { Button } from "@/components/ui/button";
import { BlueprintDefs, DoorGlyph, LabelText, ObjectGlyph, SeatGlyph, ZoneShape, type Lod } from "@/components/map2d/glyphs";
import { BlueprintPaper, RoomFloors, RoomLabels, WallsAndDoors } from "@/components/map2d/blueprint-layers";
import { Rulers, RULER_SIZE } from "./rulers";
import { DimensionOverlay } from "./dimension-overlay";
import { SnapGuides } from "./guides";

type Pt = { x: number; y: number };

type Gesture =
  | { type: "pan"; pan: { move: (x: number, y: number) => void; end: () => void } }
  | { type: "marquee"; start: Pt; current: Pt; additive: boolean; startClient: Pt }
  | { type: "move"; ids: string[]; start: Pt; startClient: Pt; origin: Record<string, MapElement>; moved: boolean; bounds: Bounds | null; cands: SnapCandidate[] }
  | { type: "resize"; id: string; handle: Handle; start: Pt; origin: MapElement; cands: SnapCandidate[] }
  | { type: "rotate"; id: string; center: Pt; origin: MapElement }
  | { type: "vertex"; id: string; index: number; origin: MapElement; cands: SnapCandidate[] }
  | { type: "edge"; id: string; index: number; start: Pt; origin: RoomEl; cands: SnapCandidate[] }
  | { type: "draw"; kind: "zone" | "room" | "room-add"; start: Pt; current: Pt; cands: SnapCandidate[] };

interface DoorCandidate {
  anchor: DoorAnchor;
  offset: number;
}

interface Overlay {
  overrides: Record<string, MapElement>;
  marquee: Bounds | null;
  draw: Bounds | null;
  /** 放置预览（座位 / 物件）的左上角 */
  cursor: Pt | null;
  door: DoorCandidate | null;
  guides: Guide[];
}

const EMPTY_OVERLAY: Overlay = { overrides: {}, marquee: null, draw: null, cursor: null, door: null, guides: [] };
/** 工具栏在左、属性面板在右：适应窗口时避开它们 */
const EDITOR_INSET = { left: 64, right: 340, top: 40 + RULER_SIZE, bottom: 0 };
const TOOL_KEYS: Record<string, Tool> = { v: "select", s: "seat", r: "room", a: "room-add", z: "zone", w: "wall", d: "door", t: "label", b: "image" };
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
  /** 工位工具当前的桌型 */
  seatStyle: SeatStyle;
  showGrid: boolean;
  onToggleGrid: () => void;
  onToggleLibrary: () => void;
  onToggleHelp: () => void;
  onSaveNow: () => void;
  onRenumber: (seatIds: string[]) => void;
  onFillRoom: (roomId: string) => void;
  /** 填充工位对话框的半透明预览 */
  previewSeats?: SeatEl[] | null;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

export function EditorCanvas({ employees, departments, furnitureType, seatStyle, showGrid, onToggleGrid, onToggleLibrary, onToggleHelp, onSaveNow, onRenumber, onFillRoom, previewSeats, svgRef }: EditorCanvasProps) {
  const vp = useViewport();
  const { transform, containerRef, fitToBounds, zoomBy, beginPan, screenToWorld, size } = vp;
  const elements = useEditorStore((s) => s.elements);
  const order = useEditorStore((s) => s.order);
  const meta = useEditorStore((s) => s.meta);
  const selection = useEditorStore((s) => s.selection);
  const tool = useEditorStore((s) => s.tool);
  const { select, add, patchMany, remove, setTool } = useEditorStore.getState();

  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const lastWorldRef = useRef<Pt | null>(null);
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
  const seatPreset = SEAT_PRESET_BY_STYLE[seatStyle];
  const roomList = useMemo(() => Object.values(elements).filter((e): e is RoomEl => e.kind === "room"), [elements]);
  const selectedRoom = useMemo(() => {
    const el = selection.length === 1 ? elements[selection[0]] : undefined;
    return el?.kind === "room" ? el : null;
  }, [elements, selection]);

  /** 房间重叠即拒绝提交（共享边允许） */
  const rejectIfOverlap = useCallback(
    (points: RPt[], excludeIds: Set<string>): boolean => {
      const hit = overlappingRooms(points, roomList.filter((r) => !excludeIds.has(r.id)));
      if (hit.length) {
        toast.error("房间不能与其他房间重叠（贴边共享墙是可以的）");
        return true;
      }
      return false;
    },
    [roomList],
  );

  /** 房间形状变化后提交：拉边 / 拖角时边序号不变，门跟着边走；顶点数变了（合并形状）才按世界位置重新锚定。 */
  const commitRoomShape = useCallback(
    (before: RoomEl, after: RoomEl) => {
      if (before.points.length === after.points.length) {
        patchMany([before.id], () => after);
        return;
      }
      const roomDoors = Object.values(elements).filter((e): e is DoorEl => e.kind === "door" && e.anchor.kind === "room" && e.anchor.roomId === before.id);
      const { doors, removed } = reanchorDoors(before, after, roomDoors, (id) => elements[id]);
      const byId = new Map(doors.map((d) => [d.id, d] as const));
      patchMany([before.id, ...doors.map((d) => d.id)], (el) => (el.id === before.id ? after : (byId.get(el.id) ?? el)));
      if (removed.length) {
        remove(removed);
        toast.message(`${removed.length} 扇门失去了所在的边，已移除`);
      }
    },
    [elements, patchMany, remove],
  );

  // ── 批量操作 / 剪贴板 ──────────────────────────────────────────────────
  const selectedEls = useMemo(() => selection.map((id) => elements[id]).filter((e): e is MapElement => Boolean(e)), [elements, selection]);
  /** 选区 + 挂在选中房间 / 墙上的门 */
  const withDoors = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      for (const el of Object.values(elements)) if (el.kind === "door" && set.has(hostOf(el))) set.add(el.id);
      return [...set];
    },
    [elements],
  );
  const applyBatch = useCallback(
    (changed: MapElement[]) => {
      if (!changed.length) return;
      const ids = new Set(changed.map((e) => e.id));
      for (const el of changed) if (el.kind === "room" && rejectIfOverlap(el.points, ids)) return;
      const map = new Map(changed.map((e) => [e.id, e] as const));
      patchMany([...ids], (el) => map.get(el.id) ?? el);
    },
    [patchMany, rejectIfOverlap],
  );
  const removeSelection = useCallback(() => {
    const st = useEditorStore.getState();
    if (st.selection.length === 0) return;
    const occupied = st.selection.filter((id) => st.elements[id]?.kind === "seat" && (st.elements[id] as SeatEl).employeeId);
    if (occupied.length) toast.error(`${occupied.length} 个座位上有人，请先释放再删除`);
    const deletable = st.selection.filter((id) => !occupied.includes(id));
    if (deletable.length) st.remove(deletable);
  }, []);
  const duplicateSelection = useCallback(() => {
    const st = useEditorStore.getState();
    if (st.selection.length === 0) return;
    const els = withDoors(st.selection).map((id) => st.elements[id]).filter((e): e is MapElement => Boolean(e));
    const codes = new Set(Object.values(st.elements).filter((e): e is SeatEl => e.kind === "seat").map((e) => e.code));
    const { items } = duplicateWithMap(els, st.meta.gridSize * 2, st.meta.gridSize * 2, codes, { byId: (id) => st.elements[id] });
    st.addMany(items);
  }, [withDoors]);
  const copySelection = useCallback(() => {
    const st = useEditorStore.getState();
    if (st.selection.length === 0) return;
    const els = withDoors(st.selection).map((id) => st.elements[id]).filter((e): e is MapElement => Boolean(e));
    useClipboardStore.getState().set(els, groupBounds(els.filter((e) => e.kind !== "door"), { byId: (id) => st.elements[id] }), st.floorId);
    toast.message(`已复制 ${els.length} 项`);
  }, [withDoors]);
  const pasteClipboard = useCallback(() => {
    const clip = useClipboardStore.getState();
    if (!clip.items.length) return;
    const st = useEditorStore.getState();
    const g = st.meta.gridSize;
    const cursor = lastWorldRef.current;
    let dx = g * 2;
    let dy = g * 2;
    if (cursor && clip.bounds) {
      dx = snap(cursor.x, g) - clip.bounds.x;
      dy = snap(cursor.y, g) - clip.bounds.y;
    } else if (clip.fromFloorId !== st.floorId && clip.bounds) {
      dx = 0;
      dy = 0;
    }
    const codes = new Set(Object.values(st.elements).filter((e): e is SeatEl => e.kind === "seat").map((e) => e.code));
    const { items, idMap } = duplicateWithMap(clip.items, dx, dy, codes, { byId: (id) => clip.items.find((e) => e.id === id) });
    const fixed = items.map((el) => {
      if (el.kind !== "seat" || !el.zoneId) return el;
      const mapped = idMap.get(el.zoneId);
      return { ...el, zoneId: mapped ?? (st.elements[el.zoneId]?.kind === "zone" ? el.zoneId : null) };
    });
    for (const el of fixed) if (el.kind === "room" && rejectIfOverlap(el.points, new Set(fixed.map((f) => f.id)))) return;
    st.addMany(fixed);
    toast.message(`已粘贴 ${fixed.length} 项`);
  }, [rejectIfOverlap]);
  const toolbarActions = useMemo<SelectionToolbarActions>(
    () => ({
      align: (mode: AlignMode) => applyBatch(alignElements(selectedEls, mode, ctx)),
      distribute: (axis) => applyBatch(distributeElements(selectedEls, axis, ctx)),
      rotate: (deg) => applyBatch(rotateGroup(withDoors(selection).map((id) => elements[id]).filter((e): e is MapElement => Boolean(e)), deg, ctx)),
      flip: (axis) => applyBatch(flipGroup(withDoors(selection).map((id) => elements[id]).filter((e): e is MapElement => Boolean(e)), axis, ctx)),
      duplicate: duplicateSelection,
      remove: removeSelection,
      renumber: () => onRenumber(selection.filter((id) => elements[id]?.kind === "seat")),
      fillRoom: () => selectedRoom && onFillRoom(selectedRoom.id),
      selectRoomContents: () => selectedRoom && select(elementsInRoom(selectedRoom, Object.values(elements)).map((e) => e.id)),
      addShape: () => setTool("room-add"),
    }),
    [applyBatch, ctx, duplicateSelection, elements, onFillRoom, onRenumber, removeSelection, select, selectedEls, selectedRoom, selection, setTool, withDoors],
  );
  const selectionBounds = useMemo(() => (selectedEls.length ? groupBounds(selectedEls, ctx) : null), [ctx, selectedEls]);
  const gestureBusy = Object.keys(overlay.overrides).length > 0 || overlay.marquee !== null || overlay.draw !== null;

  // ── 吸附 ────────────────────────────────────────────────────────────────
  const snapThreshold = 8 / k;
  const floorSize = useMemo(() => ({ w: meta.width, h: meta.height }), [meta.width, meta.height]);
  const collect = useCallback(
    (excludeIds: Set<string>, dragged?: Bounds | null) => collectCandidates({ elements: Object.values(elements), excludeIds, floor: floorSize, dragged: dragged ?? undefined, doorGeoms }),
    [doorGeoms, elements, floorSize],
  );
  const placeCands = useMemo(() => (tool === "seat" || tool === "furniture" ? collect(new Set()) : []), [collect, tool]);
  /** 放置预览：把 w×h 的矩形中心放到 world，再吸附其边缘 */
  const snapPlace = useCallback(
    (world: Pt, w: number, h: number, free: boolean): { x: number; y: number; guides: Guide[] } => {
      const x = world.x - w / 2;
      const y = world.y - h / 2;
      if (free) return { x, y, guides: [] };
      const r = snapMove({ x, y, w, h }, 0, 0, placeCands, snapThreshold, grid);
      return { x: x + r.dx, y: y + r.dy, guides: r.guides };
    },
    [grid, placeCands, snapThreshold],
  );

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
          gestureRef.current = { type: "resize", id: single.id, handle, start: world, origin: single, cands: collect(new Set([single.id])) };
          return;
        }
        if (single && rotate) {
          gestureRef.current = { type: "rotate", id: single.id, center: centerOf(single, ctx), origin: single };
          return;
        }
        if (single && vertex !== undefined) {
          gestureRef.current = { type: "vertex", id: single.id, index: Number(vertex), origin: single, cands: collect(new Set([single.id])) };
          return;
        }
        const edge = (target.closest("[data-edge]") as HTMLElement | null)?.dataset.edge;
        if (single && single.kind === "room" && edge !== undefined) {
          gestureRef.current = { type: "edge", id: single.id, index: Number(edge), start: world, origin: single, cands: collect(new Set([single.id])) };
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
          // 拖房间时带走里面的座位 / 物件 / 文字（按住 ⌘ / Ctrl 只拖房间壳）
          const moveIds = new Set(ids);
          if (!(e.metaKey || e.ctrlKey)) {
            const all = Object.values(elements);
            for (const id of ids) {
              const el = elements[id];
              if (el?.kind === "room") for (const inner of elementsInRoom(el, all)) moveIds.add(inner.id);
            }
          }
          const origin: Record<string, MapElement> = {};
          for (const id of moveIds) if (elements[id]) origin[id] = elements[id];
          const bounds = groupBounds(Object.values(origin), ctx);
          gestureRef.current = { type: "move", ids: [...moveIds], start: world, startClient: { x: e.clientX, y: e.clientY }, origin, moved: false, bounds, cands: collect(moveIds, bounds) };
          return;
        }
        gestureRef.current = { type: "marquee", start: world, current: world, additive: e.shiftKey, startClient: { x: e.clientX, y: e.clientY } };
        return;
      }

      if (tool === "seat") {
        const p = snapPlace(world, seatPreset.w, seatPreset.h, e.altKey);
        add({ kind: "seat", id: crypto.randomUUID(), code: nextSeatCode(seatCodes), x: p.x, y: p.y, w: seatPreset.w, h: seatPreset.h, rotation: 0, zoneId: null, status: "ACTIVE", note: "", employeeId: null, style: seatPreset.style });
        return;
      }
      if (tool === "furniture") {
        const p = snapPlace(world, objectDef.w, objectDef.d, e.altKey);
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
      if (tool === "zone" || tool === "room" || tool === "room-add") {
        if (tool === "room-add" && !selectedRoom) {
          toast.message("先选中一个房间，再在它上面拖出要并入的矩形");
          setTool("select");
          return;
        }
        container.setPointerCapture(e.pointerId);
        const cands = collect(new Set(selectedRoom && tool === "room-add" ? [selectedRoom.id] : []));
        const p0 = e.altKey ? world : snapPoint(world.x, world.y, cands, snapThreshold, grid);
        const p = { x: p0.x, y: p0.y };
        gestureRef.current = { type: "draw", kind: tool, start: p, current: p, cands };
        return;
      }
    },
    [add, beginPan, collect, ctx, elements, grid, objectDef, overlay.door, screenToWorld, seatCodes, seatPreset, select, selectedRoom, selection, setTool, snapPlace, snapPt, snapThreshold, tool],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const world = screenToWorld(e.clientX, e.clientY);
      lastWorldRef.current = world;
      const g = gestureRef.current;
      if (!g) {
        if (tool === "door") {
          const hit = nearestHostEdge([world.x, world.y], edges, 16 / k, DEFAULT_DOOR_WIDTH);
          const next: DoorCandidate | null = hit ? { anchor: hit.edge.anchor, offset: e.altKey ? hit.offset : Math.max(0, snap(hit.offset, grid / 2)) } : null;
          setOverlay((o) => (o.door === next || (o.door && next && o.door.offset === next.offset && JSON.stringify(o.door.anchor) === JSON.stringify(next.anchor)) ? o : { ...o, door: next }));
          return;
        }
        if (tool === "seat" || tool === "furniture") {
          const w = tool === "seat" ? seatPreset.w : objectDef.w;
          const h = tool === "seat" ? seatPreset.h : objectDef.d;
          const p = snapPlace(world, w, h, e.altKey);
          setOverlay((o) => (o.cursor && o.cursor.x === p.x && o.cursor.y === p.y ? o : { ...o, cursor: { x: p.x, y: p.y }, guides: p.guides }));
          return;
        }
        if (tool === "label" || tool === "wall") {
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
          let dx = world.x - g.start.x;
          let dy = world.y - g.start.y;
          // ⇧ 锁主轴
          if (e.shiftKey) {
            if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
            else dx = 0;
          }
          let guides: Guide[] = [];
          if (!e.altKey) {
            if (g.bounds) {
              const r = snapMove(g.bounds, dx, dy, g.cands, snapThreshold, grid);
              dx = r.dx;
              dy = r.dy;
              guides = r.guides;
            } else {
              dx = snap(dx, grid);
              dy = snap(dy, grid);
            }
          }
          const overrides = moveGroup(g.ids, g.origin, dx, dy, (id) => g.origin[id] ?? elements[id]);
          setOverlay((o) => ({ ...o, overrides, guides }));
          return;
        }
        case "resize": {
          const r = rectOf(g.origin);
          if (!r) return;
          const min = Math.max(10, grid);
          const guides: Guide[] = [];
          // 旋转过的矩形只吸网格；正放的矩形把被拖的边吸到候选线上
          const next = resizeRect(r, g.handle, world.x - g.start.x, world.y - g.start.y, min, e.altKey ? 0 : r.rotation ? grid : 0);
          if (!e.altKey && !r.rotation) {
            const h = g.handle;
            if (h.includes("e")) {
              const sr = snapValue(next.x + next.w, "x", g.cands, snapThreshold, grid, [next.y, next.y + next.h]);
              next.w = Math.max(min, sr.value - next.x);
              if (sr.guide) guides.push(sr.guide);
            }
            if (h.includes("w")) {
              const right = next.x + next.w;
              const sl = snapValue(next.x, "x", g.cands, snapThreshold, grid, [next.y, next.y + next.h]);
              next.x = Math.min(sl.value, right - min);
              next.w = right - next.x;
              if (sl.guide) guides.push(sl.guide);
            }
            if (h.includes("s")) {
              const sb = snapValue(next.y + next.h, "y", g.cands, snapThreshold, grid, [next.x, next.x + next.w]);
              next.h = Math.max(min, sb.value - next.y);
              if (sb.guide) guides.push(sb.guide);
            }
            if (h.includes("n")) {
              const bottom = next.y + next.h;
              const st = snapValue(next.y, "y", g.cands, snapThreshold, grid, [next.x, next.x + next.w]);
              next.y = Math.min(st.value, bottom - min);
              next.h = bottom - next.y;
              if (st.guide) guides.push(st.guide);
            }
          }
          setOverlay((o) => ({ ...o, overrides: { [g.id]: withRect(g.origin, next) }, guides }));
          return;
        }
        case "rotate": {
          const raw = angleFromCenter(g.center.x, g.center.y, world.x, world.y);
          const angle = normalizeAngle(snapAngle(raw, e.shiftKey));
          setOverlay((o) => ({ ...o, overrides: { [g.id]: withRotation(g.origin, angle) } }));
          return;
        }
        case "vertex": {
          const p = e.altKey ? { x: world.x, y: world.y, guides: [] as Guide[] } : snapPoint(world.x, world.y, g.cands, snapThreshold, grid);
          setOverlay((o) => ({ ...o, overrides: { [g.id]: withVertexAt(g.origin, g.index, p.x, p.y) }, guides: p.guides }));
          return;
        }
        case "edge": {
          const edge = roomEdges(g.origin.points)[g.index];
          if (!edge) return;
          const axis = edge.horizontal ? "y" : "x";
          const cur = edge.horizontal ? edge.a[1] : edge.a[0];
          const raw = cur + (edge.horizontal ? world.y - g.start.y : world.x - g.start.x);
          const extent: [number, number] = edge.horizontal ? [Math.min(edge.a[0], edge.b[0]), Math.max(edge.a[0], edge.b[0])] : [Math.min(edge.a[1], edge.b[1]), Math.max(edge.a[1], edge.b[1])];
          const sv = e.altKey ? { value: raw, guide: null } : snapValue(raw, axis, g.cands, snapThreshold, grid, extent);
          setOverlay((o) => ({ ...o, overrides: { [g.id]: { ...g.origin, points: moveRoomEdge(g.origin.points, g.index, sv.value - cur) } }, guides: sv.guide ? [sv.guide] : [] }));
          return;
        }
        case "draw": {
          const p = e.altKey ? { x: world.x, y: world.y, guides: [] as Guide[] } : snapPoint(world.x, world.y, g.cands, snapThreshold, grid);
          g.current = { x: p.x, y: p.y };
          setOverlay((o) => ({ ...o, draw: normRect(g.start, g.current), guides: p.guides }));
          return;
        }
      }
    },
    [edges, elements, grid, k, objectDef, screenToWorld, seatPreset, snapPlace, snapPt, snapThreshold, tool],
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
          // 提交的就是预览里看到的位置（含吸附）
          const moved = overlay.overrides;
          setOverlay((o) => ({ ...o, overrides: {}, guides: [] }));
          if (!g.moved || !Object.keys(moved).length) return;
          const movedIds = new Set(g.ids);
          for (const el of Object.values(moved)) if (el.kind === "room" && rejectIfOverlap(el.points, movedIds)) return;
          patchMany(g.ids, (el) => moved[el.id] ?? el);
          return;
        }
        case "resize":
        case "rotate":
        case "vertex":
        case "edge": {
          const next = overlay.overrides[g.id];
          setOverlay((o) => ({ ...o, overrides: {}, guides: [] }));
          if (!next) return;
          if (next.kind === "room") {
            if (rejectIfOverlap(next.points, new Set([next.id]))) return;
            commitRoomShape(g.origin as RoomEl, next);
            return;
          }
          patchMany([g.id], () => next);
          return;
        }
        case "draw": {
          const rect = normRect(g.start, g.current);
          setOverlay((o) => ({ ...o, draw: null, guides: [] }));
          if (g.kind === "zone") {
            if (rect.w < grid || rect.h < grid) return;
            const zoneCount = Object.values(elements).filter((el) => el.kind === "zone").length;
            const zone: ZoneEl = { kind: "zone", id: crypto.randomUUID(), name: `区域 ${zoneCount + 1}`, departmentId: null, color: null, geometry: { type: "rect", ...rect }, sortOrder: zoneCount };
            add(zone);
          } else if (g.kind === "room-add") {
            if (!selectedRoom) return;
            if (rect.w < grid || rect.h < grid) return;
            const merged = unionRectilinear(selectedRoom.points, rectToPoints(rect.x, rect.y, rect.w, rect.h));
            if (!merged) {
              toast.error("新形状必须与房间相连，且合并后不能出现洞");
              return;
            }
            if (rejectIfOverlap(merged, new Set([selectedRoom.id]))) return;
            commitRoomShape(selectedRoom, { ...selectedRoom, points: merged });
          } else {
            if (rect.w < MIN_ROOM || rect.h < MIN_ROOM) {
              if (rect.w > grid || rect.h > grid) toast.message("房间至少 1 × 1 m");
              return;
            }
            const points = rectToPoints(rect.x, rect.y, rect.w, rect.h);
            if (rejectIfOverlap(points, new Set())) return;
            const roomCount = roomList.length;
            const room: RoomEl = { kind: "room", id: crypto.randomUUID(), name: `房间 ${roomCount + 1}`, type: "office", points, floorStyle: null, wallHeight: null };
            add(room);
          }
          setTool("select");
          return;
        }
      }
    },
    [add, commitRoomShape, doorGeoms, elements, grid, k, overlay.overrides, patchMany, rejectIfOverlap, roomList, screenToWorld, select, selectedRoom, selection, setTool],
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
        duplicateSelection();
        return;
      }
      if (mod && key === "c") {
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && key === "v") {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (e.key === "Escape") {
        setMenu(null);
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
        e.preventDefault();
        removeSelection();
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
      if (!mod && key === "f") {
        onToggleLibrary();
        return;
      }
      if (e.key === "?") {
        onToggleHelp();
        return;
      }
      if (!mod && !e.shiftKey && TOOL_KEYS[key]) {
        if (key === "a") {
          const sel = st.selection.length === 1 ? st.elements[st.selection[0]] : undefined;
          if (sel?.kind !== "room") {
            toast.message("先选中一个房间，再按 A 添加形状");
            return;
          }
        }
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
  }, [copySelection, duplicateSelection, finishWall, onSaveNow, onToggleGrid, onToggleHelp, onToggleLibrary, pasteClipboard, removeSelection, wallDraft.length]);

  // 右键菜单：点别处关闭
  useEffect(() => {
    if (!menu) return;
    const close = (ev: PointerEvent) => {
      if ((ev.target as Element).closest?.("[data-context-menu]")) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [menu]);

  // ── 从物件库拖入 ────────────────────────────────────────────────────────
  const libDrag = useLibraryDragStore((s) => s.drag);
  useEffect(() => {
    if (!libDrag) return;
    const sizeOf = () => (libDrag.kind === "seat" ? { w: SEAT_PRESET_BY_STYLE[libDrag.style].w, h: SEAT_PRESET_BY_STYLE[libDrag.style].h } : { w: catalogDef(libDrag.typeKey).w, h: catalogDef(libDrag.typeKey).d });
    const overCanvas = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      return Boolean(el && containerRef.current?.contains(el) && !el.closest("[data-ui]"));
    };
    const onMove = (ev: PointerEvent) => {
      useLibraryDragStore.getState().move(ev.clientX, ev.clientY);
      if (!overCanvas(ev.clientX, ev.clientY)) {
        setOverlay((o) => (o.cursor ? { ...o, cursor: null, guides: [] } : o));
        return;
      }
      const world = screenToWorld(ev.clientX, ev.clientY);
      const { w, h } = sizeOf();
      const p = snapPlace(world, w, h, ev.altKey);
      setOverlay((o) => ({ ...o, cursor: { x: p.x, y: p.y }, guides: p.guides }));
    };
    const onUp = (ev: PointerEvent) => {
      const d = useLibraryDragStore.getState().drag;
      useLibraryDragStore.getState().end();
      setOverlay((o) => ({ ...o, cursor: null, guides: [] }));
      if (!d || !overCanvas(ev.clientX, ev.clientY)) return;
      const world = screenToWorld(ev.clientX, ev.clientY);
      const { w, h } = sizeOf();
      const p = snapPlace(world, w, h, ev.altKey);
      const st = useEditorStore.getState();
      if (d.kind === "seat") {
        const codes = new Set(Object.values(st.elements).filter((e): e is SeatEl => e.kind === "seat").map((e) => e.code));
        st.add({ kind: "seat", id: crypto.randomUUID(), code: nextSeatCode(codes), x: p.x, y: p.y, w, h, rotation: 0, zoneId: null, status: "ACTIVE", note: "", employeeId: null, style: d.style });
      } else {
        st.add({ kind: "furniture", id: crypto.randomUUID(), typeKey: d.typeKey, typeId: null, x: p.x, y: p.y, w, h, rotation: 0, name: "", flip: false });
      }
    };
    const onCancel = () => {
      useLibraryDragStore.getState().end();
      setOverlay((o) => ({ ...o, cursor: null, guides: [] }));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    const prev = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.body.style.cursor = prev;
    };
  }, [containerRef, libDrag, screenToWorld, snapPlace]);

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
  const invalidRoomIds = useMemo(() => {
    const ids = new Set<string>();
    const overridden = Object.values(overlay.overrides).filter((e): e is RoomEl => e.kind === "room");
    if (!overridden.length) return ids;
    const others = displayRooms.filter((r) => !(r.id in overlay.overrides));
    for (const r of overridden) if (overlappingRooms(r.points, others).length) ids.add(r.id);
    return ids;
  }, [displayRooms, overlay.overrides]);
  const drawPoints = useMemo(() => (overlay.draw ? rectToPoints(overlay.draw.x, overlay.draw.y, overlay.draw.w, overlay.draw.h) : null), [overlay.draw]);
  const drawInvalid = useMemo(() => Boolean(tool === "room" && drawPoints && overlappingRooms(drawPoints, roomList).length), [drawPoints, roomList, tool]);
  const unionPreview = useMemo(() => {
    if (tool !== "room-add" || !drawPoints || !selectedRoom) return null;
    const merged = unionRectilinear(selectedRoom.points, drawPoints);
    return { merged, invalid: !merged || overlappingRooms(merged, roomList, selectedRoom.id).length > 0 };
  }, [drawPoints, roomList, selectedRoom, tool]);
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
      onPointerLeave={() => setOverlay((o) => (o.cursor || o.door || o.guides.length ? { ...o, cursor: null, door: null, guides: gestureRef.current ? o.guides : [] } : o))}
      onDoubleClick={(e) => {
        if (tool === "wall") {
          e.preventDefault();
          finishWall();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const target = e.target as Element;
        if (target.closest("[data-ui]")) return;
        const elId = (target.closest("[data-id]") as HTMLElement | null)?.dataset.id;
        if (elId && !selection.includes(elId)) select([elId]);
        const rect = e.currentTarget.getBoundingClientRect();
        setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
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
            invalidIds={invalidRoomIds}
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

          {previewSeats?.map((s) => (
            <g key={s.id} opacity={0.45} style={{ pointerEvents: "none" }}>
              <SeatGlyph seat={s} employee={null} department={null} lod={lod} hovered={false} selected={false} dimmed={false} interactive={false} />
            </g>
          ))}

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
          {overlay.cursor && (tool === "seat" || libDrag?.kind === "seat") && (() => {
            const preset = libDrag?.kind === "seat" ? SEAT_PRESET_BY_STYLE[libDrag.style] : seatPreset;
            return (
              <g style={{ pointerEvents: "none" }} opacity={0.6}>
                <SeatGlyph seat={{ kind: "seat", id: "preview", code: "", x: overlay.cursor.x, y: overlay.cursor.y, w: preset.w, h: preset.h, rotation: 0, zoneId: null, status: "ACTIVE", note: "", employeeId: null, style: preset.style }} employee={null} department={null} lod={0} hovered={false} selected={false} dimmed={false} interactive={false} />
              </g>
            );
          })()}
          {overlay.cursor && (tool === "furniture" || libDrag?.kind === "object") && (() => {
            const def = libDrag?.kind === "object" ? catalogDef(libDrag.typeKey) : objectDef;
            return (
              <g style={{ pointerEvents: "none" }} opacity={0.55}>
                <ObjectGlyph item={{ kind: "furniture", id: "preview", typeKey: def.key, typeId: null, x: overlay.cursor.x, y: overlay.cursor.y, w: def.w, h: def.d, rotation: 0, name: "", flip: false }} def={def} lod={lod} k={k} />
              </g>
            );
          })()}
          {tool === "door" && previewDoor && (
            <g style={{ pointerEvents: "none" }} opacity={0.7}>
              <DoorGlyph geom={previewDoor} k={k} />
            </g>
          )}
          {overlay.draw && (
            <g style={{ pointerEvents: "none" }}>
              {unionPreview?.merged && !unionPreview.invalid && (
                <polygon points={unionPreview.merged.map((p) => p.join(",")).join(" ")} fill="var(--info)" fillOpacity={0.1} stroke="var(--info)" strokeWidth={2 / k} />
              )}
              <rect
                x={overlay.draw.x}
                y={overlay.draw.y}
                width={overlay.draw.w}
                height={overlay.draw.h}
                rx={tool === "zone" ? 12 : 0}
                fill={drawInvalid || unionPreview?.invalid ? "var(--danger)" : "var(--info)"}
                fillOpacity={0.12}
                stroke={drawInvalid || unionPreview?.invalid ? "var(--danger)" : "var(--info)"}
                strokeWidth={2 / k}
                strokeDasharray={`${8 / k} ${6 / k}`}
              />
              {(tool === "room" || tool === "room-add") && (
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
          {single && single.kind === "room" && !invalidRoomIds.size &&
            roomEdges(single.points).map((e) => (
              <rect
                key={`edge-${e.index}`}
                data-edge={e.index}
                x={(e.a[0] + e.b[0]) / 2 - handleSize / 2}
                y={(e.a[1] + e.b[1]) / 2 - handleSize / 2}
                width={handleSize}
                height={handleSize}
                rx={handleSize * 0.2}
                fill="var(--surface)"
                stroke="var(--info)"
                strokeWidth={1.5 / k}
                style={{ cursor: e.horizontal ? "ns-resize" : "ew-resize" }}
              />
            ))}
          {single && singlePoints && singlePoints.map(([x, y], i) => (
            <circle key={i} data-vertex={i} cx={x} cy={y} r={handleSize * 0.6} fill="var(--surface)" stroke="var(--info)" strokeWidth={1.5 / k} style={{ cursor: "move" }} />
          ))}
          <SnapGuides guides={overlay.guides} k={k} />
          {overlay.marquee && (
            <rect x={overlay.marquee.x} y={overlay.marquee.y} width={overlay.marquee.w} height={overlay.marquee.h} fill="var(--info)" fillOpacity={0.08} stroke="var(--info)" strokeWidth={1 / k} style={{ pointerEvents: "none" }} />
          )}
        </g>
      </svg>
      <Rulers transform={transform} size={size} containerRef={containerRef} />
      {tool === "select" && selectionBounds && !gestureBusy && !menu && (
        <SelectionToolbar
          left={Math.min(size.w - 200, Math.max(200, transform.x + k * (selectionBounds.x + selectionBounds.w / 2)))}
          top={Math.min(size.h - 20, Math.max(RULER_SIZE + 50, transform.y + k * selectionBounds.y))}
          count={selection.length}
          seatCount={selectedEls.filter((e) => e.kind === "seat").length}
          roomSelected={selectedRoom !== null}
          actions={toolbarActions}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          hasSelection={selection.length > 0}
          hasClipboard={useClipboardStore.getState().items.length > 0}
          seatCount={selectedEls.filter((e) => e.kind === "seat").length}
          roomSelected={selectedRoom !== null}
          decorSelected={selectedEls.some((e) => e.kind !== "seat" && e.kind !== "zone")}
          actions={toolbarActions}
          onCopy={copySelection}
          onPaste={pasteClipboard}
          onReorder={(dir) => {
            const st = useEditorStore.getState();
            for (const id of st.selection) st.reorder(id, dir);
          }}
          onClose={() => setMenu(null)}
        />
      )}

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
        {tool === "room" && <span className="ml-2 text-info">拖出房间范围（至少 1 × 1 m）· 房间之间可以贴边但不能重叠</span>}
        {tool === "room-add" && <span className="ml-2 text-info">在「{selectedRoom?.name || "房间"}」上再拖一个矩形并入（可做 L 形 / 凹形）</span>}
        {tool === "door" && <span className="ml-2 text-info">移到房间边或墙上点击放置 · 选中后 X 换开向、⇧X 换铰链</span>}
        {tool === "furniture" && <span className="ml-2 text-info">点击放置：{objectDef.name}（按住 ⇧ 连续放置 · F 打开物件库）</span>}
        {tool === "seat" && <span className="ml-2 text-info">点击放置：{seatPreset.name}（F 打开物件库换桌型）</span>}
        {tool === "zone" && <span className="ml-2 text-info">拖出区域范围</span>}
        {tool === "select" && selection.length > 0 && <span className="ml-2">拖动时自动吸附 · ⌥ 关闭吸附 · ⇧ 锁定方向</span>}
      </div>
    </div>
  );
}

function MenuItem({ label, hint, onClick, disabled, danger, onClose }: { label: string; hint?: string; onClick: () => void; disabled?: boolean; danger?: boolean; onClose: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onClick();
        onClose();
      }}
      className={`flex w-full items-center justify-between gap-6 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent ${danger ? "text-danger" : ""}`}
    >
      <span>{label}</span>
      {hint && <kbd className="font-mono text-[10px] text-muted-foreground">{hint}</kbd>}
    </button>
  );
}

function MenuSep() {
  return <div className="my-1 h-px bg-border" />;
}

function ContextMenu({
  x,
  y,
  hasSelection,
  hasClipboard,
  seatCount,
  roomSelected,
  decorSelected,
  actions,
  onCopy,
  onPaste,
  onReorder,
  onClose,
}: {
  x: number;
  y: number;
  hasSelection: boolean;
  hasClipboard: boolean;
  seatCount: number;
  roomSelected: boolean;
  decorSelected: boolean;
  actions: SelectionToolbarActions;
  onCopy: () => void;
  onPaste: () => void;
  onReorder: (dir: "front" | "back") => void;
  onClose: () => void;
}) {
  return (
    <div data-ui data-context-menu className="absolute z-30 w-48 rounded-lg border border-border bg-surface/98 p-1 shadow-pop backdrop-blur" style={{ left: x, top: y }}>
      <MenuItem label="复制" hint="⌘C" onClick={onCopy} disabled={!hasSelection} onClose={onClose} />
      <MenuItem label="粘贴" hint="⌘V" onClick={onPaste} disabled={!hasClipboard} onClose={onClose} />
      <MenuItem label="复制一份" hint="⌘D" onClick={actions.duplicate} disabled={!hasSelection} onClose={onClose} />
      {hasSelection && (
        <>
          <MenuSep />
          <MenuItem label="顺时针转 90°" hint="⇧R" onClick={() => actions.rotate(90)} onClose={onClose} />
          <MenuItem label="左右镜像" onClick={() => actions.flip("x")} onClose={onClose} />
          {seatCount > 1 && <MenuItem label="重新编号…" onClick={actions.renumber} onClose={onClose} />}
          {roomSelected && (
            <>
              <MenuItem label="填充工位…" onClick={actions.fillRoom} onClose={onClose} />
              <MenuItem label="选中房间内的元素" onClick={actions.selectRoomContents} onClose={onClose} />
              <MenuItem label="添加形状" hint="A" onClick={actions.addShape} onClose={onClose} />
            </>
          )}
          {decorSelected && (
            <>
              <MenuSep />
              <MenuItem label="置顶" onClick={() => onReorder("front")} onClose={onClose} />
              <MenuItem label="置底" onClick={() => onReorder("back")} onClose={onClose} />
            </>
          )}
          <MenuSep />
          <MenuItem label="删除" hint="⌫" onClick={actions.remove} danger onClose={onClose} />
        </>
      )}
    </div>
  );
}
