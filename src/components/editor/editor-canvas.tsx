"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import type { DepartmentSummary, EmployeeSummary, FurnitureType, MapElement, SeatEl, ZoneEl } from "@/lib/map/types";
import { DEFAULT_SEAT_SIZE, FURNITURE_LABELS } from "@/lib/map/types";
import {
  angleFromCenter,
  boundsIntersect,
  elementBounds,
  nextSeatCode,
  normalizeAngle,
  rectTransform,
  resizeRect,
  snap,
  type Bounds,
  type Handle,
  type RectLike,
} from "@/lib/map/geometry";
import { useViewport } from "@/hooks/use-viewport";
import { redo, undo, useEditorStore, type Tool } from "@/stores/editor-store";
import { withBasePath } from "@/lib/base-path";
import { Button } from "@/components/ui/button";
import { DoorGlyph, FurnitureGlyph, LabelText, SeatGlyph, WallPath, ZoneShape, type Lod } from "@/components/map2d/glyphs";

type Pt = { x: number; y: number };

type Gesture =
  | { type: "pan"; pan: { move: (x: number, y: number) => void; end: () => void } }
  | { type: "marquee"; start: Pt; current: Pt; additive: boolean; startClient: Pt }
  | { type: "move"; ids: string[]; start: Pt; startClient: Pt; origin: Record<string, MapElement>; moved: boolean }
  | { type: "resize"; id: string; handle: Handle; start: Pt; origin: MapElement }
  | { type: "rotate"; id: string; center: Pt; origin: MapElement }
  | { type: "vertex"; id: string; index: number; origin: MapElement }
  | { type: "draw"; kind: "zone" | "furniture"; start: Pt; current: Pt };

interface Overlay {
  overrides: Record<string, MapElement>;
  marquee: Bounds | null;
  draw: Bounds | null;
  cursor: Pt | null;
}

const EMPTY_OVERLAY: Overlay = { overrides: {}, marquee: null, draw: null, cursor: null };
/** 工具栏在左、属性面板在右：适应窗口时避开它们 */
const EDITOR_INSET = { left: 64, right: 340, top: 40, bottom: 0 };
const TOOL_KEYS: Record<string, Tool> = { v: "select", s: "seat", z: "zone", w: "wall", d: "door", t: "label", f: "furniture", b: "image" };

function translateEl(el: MapElement, dx: number, dy: number): MapElement {
  switch (el.kind) {
    case "wall":
      return { ...el, points: el.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    case "zone":
      return el.geometry.type === "rect"
        ? { ...el, geometry: { ...el.geometry, x: el.geometry.x + dx, y: el.geometry.y + dy } }
        : { ...el, geometry: { ...el.geometry, points: el.geometry.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) } };
    default:
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
}

function rectOf(el: MapElement): RectLike | null {
  if (el.kind === "seat" || el.kind === "furniture") return { x: el.x, y: el.y, w: el.w, h: el.h, rotation: el.rotation };
  if (el.kind === "zone" && el.geometry.type === "rect") return { x: el.geometry.x, y: el.geometry.y, w: el.geometry.w, h: el.geometry.h, rotation: el.geometry.rotation ?? 0 };
  if (el.kind === "door") return { x: el.x, y: el.y - el.w, w: el.w, h: el.w, rotation: el.rotation };
  return null;
}

function withRect(el: MapElement, r: RectLike): MapElement {
  if (el.kind === "seat" || el.kind === "furniture") return { ...el, x: r.x, y: r.y, w: r.w, h: r.h, rotation: r.rotation };
  if (el.kind === "zone" && el.geometry.type === "rect") return { ...el, geometry: { ...el.geometry, x: r.x, y: r.y, w: r.w, h: r.h, rotation: r.rotation } };
  return el;
}

function pointsOf(el: MapElement): [number, number][] | null {
  if (el.kind === "wall") return el.points;
  if (el.kind === "zone" && el.geometry.type === "polygon") return el.geometry.points;
  return null;
}

function withPoints(el: MapElement, points: [number, number][]): MapElement {
  if (el.kind === "wall") return { ...el, points };
  if (el.kind === "zone" && el.geometry.type === "polygon") return { ...el, geometry: { type: "polygon", points } };
  return el;
}

function rotationOf(el: MapElement): number | null {
  if (el.kind === "seat" || el.kind === "furniture" || el.kind === "door" || el.kind === "label") return el.rotation;
  if (el.kind === "zone" && el.geometry.type === "rect") return el.geometry.rotation ?? 0;
  return null;
}

function withRotation(el: MapElement, rotation: number): MapElement {
  if (el.kind === "seat" || el.kind === "furniture" || el.kind === "door" || el.kind === "label") return { ...el, rotation };
  if (el.kind === "zone" && el.geometry.type === "rect") return { ...el, geometry: { ...el.geometry, rotation } };
  return el;
}

function centerOf(el: MapElement): Pt {
  const b = elementBounds(el);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function normRect(a: Pt, b: Pt): Bounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export interface EditorCanvasProps {
  employees: Record<string, EmployeeSummary>;
  departments: Record<string, DepartmentSummary>;
  furnitureType: FurnitureType;
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
  const gridStep = k < 0.5 ? grid * 5 : grid;
  const handleSize = 9 / k;

  const displayEl = useCallback((id: string): MapElement | undefined => overlay.overrides[id] ?? elements[id], [elements, overlay.overrides]);

  const snapPt = useCallback((p: Pt, free = false): Pt => (free ? p : { x: snap(p.x, grid), y: snap(p.y, grid) }), [grid]);

  const seatCodes = useMemo(() => new Set(Object.values(elements).filter((e): e is SeatEl => e.kind === "seat").map((e) => e.code)), [elements]);

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
          gestureRef.current = { type: "rotate", id: single.id, center: centerOf(single), origin: single };
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
        add({ kind: "seat", id: crypto.randomUUID(), code: nextSeatCode(seatCodes), x: p.x, y: p.y, w: DEFAULT_SEAT_SIZE.w, h: DEFAULT_SEAT_SIZE.h, rotation: 0, zoneId: null, status: "ACTIVE", note: "", employeeId: null });
        return;
      }
      if (tool === "door") {
        const p = snapPt(world, e.altKey);
        add({ kind: "door", id: crypto.randomUUID(), x: p.x, y: p.y, rotation: 0, w: 90, flip: false });
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
      if (tool === "zone" || tool === "furniture") {
        container.setPointerCapture(e.pointerId);
        const p = snapPt(world, e.altKey);
        gestureRef.current = { type: "draw", kind: tool, start: p, current: p };
        return;
      }
    },
    [add, beginPan, elements, grid, screenToWorld, seatCodes, select, selection, setTool, snapPt, tool],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const world = screenToWorld(e.clientX, e.clientY);
      const g = gestureRef.current;
      if (!g) {
        if (tool === "seat" || tool === "door" || tool === "label" || tool === "wall") {
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
          const overrides: Record<string, MapElement> = {};
          for (const id of g.ids) overrides[id] = translateEl(g.origin[id], sdx, sdy);
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
          const pts = pointsOf(g.origin);
          if (!pts) return;
          const p = snapPt(world, e.altKey);
          const next = pts.map((pt, i) => (i === g.index ? ([p.x, p.y] as [number, number]) : pt));
          setOverlay((o) => ({ ...o, overrides: { [g.id]: withPoints(g.origin, next) } }));
          return;
        }
        case "draw": {
          g.current = snapPt(world, e.altKey);
          setOverlay((o) => ({ ...o, draw: normRect(g.start, g.current) }));
          return;
        }
      }
    },
    [grid, screenToWorld, snapPt, tool],
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
              .filter((el) => boundsIntersect(rect, elementBounds(el)))
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
            if (sdx !== 0 || sdy !== 0) patchMany(g.ids, (el) => translateEl(g.origin[el.id] ?? el, sdx, sdy));
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
          if (rect.w < grid || rect.h < grid) return;
          if (g.kind === "zone") {
            const zoneCount = Object.values(elements).filter((el) => el.kind === "zone").length;
            const zone: ZoneEl = { kind: "zone", id: crypto.randomUUID(), name: `区域 ${zoneCount + 1}`, departmentId: null, color: null, geometry: { type: "rect", ...rect }, sortOrder: zoneCount };
            add(zone);
          } else {
            add({ kind: "furniture", id: crypto.randomUUID(), type: furnitureType, x: rect.x, y: rect.y, w: rect.w, h: rect.h, rotation: 0, name: "" });
          }
          setTool("select");
          return;
        }
      }
    },
    [add, elements, furnitureType, grid, k, overlay.overrides, patchMany, screenToWorld, select, selection, setTool],
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
      const st = useEditorStore.getState();
      if (e.code === "Space") {
        spaceRef.current = true;
        e.preventDefault();
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSaveNow();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        st.select(Object.keys(st.elements));
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (st.selection.length === 0) return;
        const codes = new Set(Object.values(st.elements).filter((el): el is SeatEl => el.kind === "seat").map((el) => el.code));
        const copies: MapElement[] = [];
        for (const id of st.selection) {
          const el = st.elements[id];
          if (!el) continue;
          const moved = translateEl(el, st.meta.gridSize * 2, st.meta.gridSize * 2);
          if (moved.kind === "seat") {
            const code = nextSeatCode(codes, moved.code.replace(/\d+$/, "") || "S");
            codes.add(code);
            copies.push({ ...moved, id: crypto.randomUUID(), code, employeeId: null });
          } else {
            copies.push({ ...moved, id: crypto.randomUUID() });
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
        st.patchMany(st.selection, (el) => translateEl(el, dx, dy));
        return;
      }
      if (!mod && e.key.toLowerCase() === "r" && st.selection.length) {
        st.patchMany(st.selection, (el) => {
          const r = rotationOf(el);
          return r === null ? el : withRotation(el, normalizeAngle(r + 90));
        });
        return;
      }
      if (!mod && e.key.toLowerCase() === "g") {
        onToggleGrid();
        return;
      }
      if (!mod && TOOL_KEYS[e.key.toLowerCase()]) {
        st.setTool(TOOL_KEYS[e.key.toLowerCase()]);
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
  const selected = useMemo(() => new Set(selection), [selection]);
  const single = selection.length === 1 ? displayEl(selection[0]) : undefined;
  const singleRect = single ? rectOf(single) : null;
  const singlePoints = single ? pointsOf(single) : null;
  const cursorClass =
    tool === "select" ? "cursor-default" : tool === "image" ? "cursor-default" : "cursor-crosshair";

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full touch-none select-none overflow-hidden bg-map-canvas ${cursorClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
          <pattern id="editor-grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={(1.2 / Math.max(0.3, k)) * 0.8} fill="var(--map-grid)" />
          </pattern>
          <pattern id="seat-hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={8} stroke="var(--seat-sub)" strokeOpacity={0.35} strokeWidth={2} />
          </pattern>
        </defs>
        <g data-map-root transform={`translate(${transform.x} ${transform.y}) scale(${k})`}>
          <rect x={0} y={0} width={meta.width} height={meta.height} fill="var(--map-floor)" stroke="var(--border-strong)" strokeWidth={2 / k} />
          {meta.backgroundKey && meta.background && (
            <image
              href={withBasePath(`/api/files/${meta.backgroundKey}`)}
              x={meta.background.x}
              y={meta.background.y}
              width={meta.background.w}
              height={meta.background.h}
              opacity={meta.background.opacity}
              preserveAspectRatio="none"
              style={{ pointerEvents: "none" }}
            />
          )}
          {showGrid && k >= 0.25 && <rect x={0} y={0} width={meta.width} height={meta.height} fill="url(#editor-grid)" style={{ pointerEvents: "none" }} />}

          {zones.map((z) => {
            const el = (displayEl(z.id) as ZoneEl) ?? z;
            return (
              <g key={z.id} data-id={z.id}>
                <ZoneShape zone={el} departments={departments} dimmed={false} selected={selected.has(z.id)} interactive k={k} />
              </g>
            );
          })}

          {order.map((id) => {
            const el = displayEl(id);
            if (!el) return null;
            const sel = selected.has(id);
            switch (el.kind) {
              case "wall":
                return (
                  <g key={id} data-id={id} className="cursor-move">
                    <WallPath wall={el} selected={sel} />
                  </g>
                );
              case "door":
                return (
                  <g key={id} data-id={id} className="cursor-move">
                    <DoorGlyph door={el} selected={sel} />
                  </g>
                );
              case "furniture":
                return (
                  <g key={id} data-id={id} className="cursor-move">
                    <FurnitureGlyph item={el} selected={sel} lod={lod} k={k} />
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
          {overlay.cursor && tool === "door" && (
            <g style={{ pointerEvents: "none" }} opacity={0.6}>
              <DoorGlyph door={{ kind: "door", id: "preview", x: overlay.cursor.x, y: overlay.cursor.y, rotation: 0, w: 90, flip: false }} />
            </g>
          )}
          {overlay.draw && (
            <rect x={overlay.draw.x} y={overlay.draw.y} width={overlay.draw.w} height={overlay.draw.h} rx={tool === "zone" ? 12 : 8} fill="var(--info)" fillOpacity={0.12} stroke="var(--info)" strokeWidth={2 / k} strokeDasharray={`${8 / k} ${6 / k}`} style={{ pointerEvents: "none" }} />
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
            const b = elementBounds(el);
            return <rect key={id} x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} fill="none" stroke="var(--info)" strokeWidth={1.5 / k} strokeDasharray={`${6 / k} ${4 / k}`} style={{ pointerEvents: "none" }} />;
          })}
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
              )
                .filter(([h]) => single.kind !== "door" || h === "e" || h === "w")
                .map(([h, hx, hy]) => (
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
        {tool === "furniture" && <span className="ml-2 text-info">拖出一个矩形：{FURNITURE_LABELS[furnitureType]}</span>}
        {tool === "zone" && <span className="ml-2 text-info">拖出区域范围</span>}
      </div>
    </div>
  );
}
