"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { FloorScene } from "@/lib/map/types";
import { centerTransform } from "@/lib/map/geometry";
import { useViewport } from "@/hooks/use-viewport";
import { useViewStore } from "@/stores/view-store";
import { beginDragCandidate, useDragStore } from "@/stores/drag-store";
import { Button } from "@/components/ui/button";
import { SeatTooltip } from "@/components/floor/seat-tooltip";
import { BlueprintDefs, LabelText, ObjectGlyph, SeatGlyph, ZoneShape, type Lod } from "./glyphs";
import { BlueprintPaper, RoomFloors, RoomLabels, WallsAndDoors } from "./blueprint-layers";
import { deriveWalls } from "@/lib/map/walls";
import type { RoomEl } from "@/lib/map/types";

export interface FloorMap2DProps {
  scene: FloorScene;
  /** 分配模式：已落座的人可以拖走，拖拽悬停的座位高亮 */
  assignMode?: boolean;
  /** 点击座位（查看/分配模式）。 */
  onSeatClick?: (seatId: string) => void;
  /** 点击空白处。 */
  onBackgroundClick?: () => void;
  /** 供导出使用：拿到 svg 节点 */
  svgRef?: React.RefObject<SVGSVGElement | null>;
  children?: React.ReactNode;
}

const DRAG_THRESHOLD = 4;

export function FloorMap2D({ scene, assignMode = false, onSeatClick, onBackgroundClick, svgRef, children }: FloorMap2DProps) {
  const vp = useViewport();
  const { transform, containerRef, fitToBounds, animateTo, zoomBy, beginPan, size } = vp;
  const hoveredSeatId = useViewStore((s) => s.hoveredSeatId);
  const selectedSeatId = useViewStore((s) => s.selectedSeatId);
  const highlightDeptId = useViewStore((s) => s.highlightDeptId);
  const pulseSeatId = useViewStore((s) => s.pulseSeatId);
  const flyTo = useViewStore((s) => s.flyTo);
  const setHovered = useViewStore((s) => s.setHovered);
  const setPulse = useViewStore((s) => s.setPulse);
  const dragOverSeatId = useDragStore((s) => s.overSeatId);
  const dragging = useDragStore((s) => s.drag);

  const [tooltip, setTooltip] = useState<{ seatId: string; left: number; top: number; containerW: number } | null>(null);
  const panRef = useRef<{ start: { x: number; y: number }; pan: ReturnType<typeof beginPan> | null; dragging: boolean; target: EventTarget | null } | null>(null);
  const fittedFloorRef = useRef<string | null>(null);

  const { floor, seats, zones, decor, employees, departments } = scene;
  const floorBounds = useMemo(() => ({ x: 0, y: 0, w: floor.width, h: floor.height }), [floor.width, floor.height]);
  const rooms = useMemo(() => decor.elements.filter((el): el is RoomEl => el.kind === "room"), [decor.elements]);
  const derived = useMemo(() => deriveWalls(decor.elements), [decor.elements]);
  const background = floor.backgroundKey && decor.background ? { key: floor.backgroundKey, ...decor.background } : null;

  // 首次（或切换楼层）时把整层放进视口
  useEffect(() => {
    if (!size.w || !size.h) return;
    if (fittedFloorRef.current === floor.id) return;
    fittedFloorRef.current = floor.id;
    fitToBounds(floorBounds, 32, false, assignMode ? { left: 300, right: 0, top: 0, bottom: 0 } : undefined);
  }, [assignMode, floor.id, floorBounds, fitToBounds, size.h, size.w]);

  // 定位飞行 + 脉冲
  useEffect(() => {
    if (!flyTo) return;
    const seat = seats.find((s) => s.id === flyTo.seatId);
    if (!seat || !size.w) return;
    const k = Math.min(2.4, Math.max(1.2, 180 / seat.w));
    animateTo(centerTransform(seat.x + seat.w / 2, seat.y + seat.h / 2, k, size.w, size.h));
    setPulse(seat.id);
    const t = setTimeout(() => setPulse(null), 2000);
    return () => clearTimeout(t);
  }, [flyTo, seats, animateTo, size.w, size.h, setPulse]);

  const lod: Lod = transform.k < 0.6 ? 0 : transform.k < 1.1 ? 1 : 2;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      if ((e.target as Element).closest?.("[data-ui]")) return;
      // 分配模式下按住已落座的人 → 拖拽候选（移动超过阈值才开始，否则仍是点击）
      if (assignMode && e.button === 0) {
        const seatId = ((e.target as Element).closest("[data-seat-id]") as HTMLElement | null)?.dataset.seatId;
        const seat = seatId ? seats.find((s) => s.id === seatId) : null;
        const emp = seat?.employeeId ? employees[seat.employeeId] : null;
        if (seat && emp) {
          panRef.current = { start: { x: e.clientX, y: e.clientY }, pan: null, dragging: false, target: e.target };
          beginDragCandidate(e, {
            kind: "occupant",
            employeeId: emp.id,
            fromSeatId: seat.id,
            label: emp.name,
            sub: seat.code,
            color: emp.departmentId ? departments[emp.departmentId]?.color : undefined,
          });
          return;
        }
      }
      if (e.pointerType !== "touch") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      // 单指拖动平移；双指交给 useViewport 的捏合处理
      panRef.current = { start: { x: e.clientX, y: e.clientY }, pan: beginPan(e.clientX, e.clientY), dragging: false, target: e.target };
    },
    [assignMode, beginPan, departments, employees, seats],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const p = panRef.current;
      if (p && !p.pan) {
        // 拖拽候选：一旦拖拽开始，这次按下就不再算点击
        if (useDragStore.getState().drag) p.dragging = true;
        return;
      }
      if (p?.pan) {
        if (!p.dragging && Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) > DRAG_THRESHOLD) p.dragging = true;
        if (p.dragging) {
          p.pan.move(e.clientX, e.clientY);
          if (tooltip) setTooltip(null);
        }
        return;
      }
      if (tooltip) {
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip((t) => (t ? { ...t, left: e.clientX - (rect?.left ?? 0), top: e.clientY - (rect?.top ?? 0) } : t));
      }
    },
    [containerRef, tooltip],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const p = panRef.current;
      panRef.current = null;
      if (!p) return;
      if (p.dragging) return; // 是拖拽，不算点击
      const el = (p.target as Element | null)?.closest?.("[data-seat-id]") as HTMLElement | null;
      if (el?.dataset.seatId) {
        onSeatClick?.(el.dataset.seatId);
        return;
      }
      if (!(p.target as Element | null)?.closest?.("[data-ui]")) onBackgroundClick?.();
      void e;
    },
    [onBackgroundClick, onSeatClick],
  );

  const onPointerOver = useCallback(
    (e: React.PointerEvent) => {
      const el = (e.target as Element).closest("[data-seat-id]") as HTMLElement | null;
      const id = el?.dataset.seatId ?? null;
      if (id !== hoveredSeatId) setHovered(id);
      if (id) {
        const rect = containerRef.current?.getBoundingClientRect();
        setTooltip({ seatId: id, left: e.clientX - (rect?.left ?? 0), top: e.clientY - (rect?.top ?? 0), containerW: rect?.width ?? 0 });
      } else if (tooltip) setTooltip(null);
    },
    [containerRef, hoveredSeatId, setHovered, tooltip],
  );

  const onPointerLeave = useCallback(() => {
    setHovered(null);
    setTooltip(null);
    panRef.current = null;
  }, [setHovered]);

  const zoneDimmed = (deptId: string | null) => Boolean(highlightDeptId && deptId !== highlightDeptId);
  const pulseSeat = pulseSeatId ? seats.find((s) => s.id === pulseSeatId) : null;
  const tooltipSeat = tooltip ? seats.find((s) => s.id === tooltip.seatId) : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-map-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerLeave}
      onPointerLeave={onPointerLeave}
      onPointerOver={onPointerOver}
    >
      <svg ref={svgRef} className="block h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <BlueprintDefs k={transform.k} />
        </defs>
        <g data-map-root transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          <BlueprintPaper width={floor.width} height={floor.height} gridSize={floor.gridSize} k={transform.k} showGrid background={background} idPrefix="view" />

          {/* 房间地面 */}
          <RoomFloors rooms={rooms} k={transform.k} />

          {/* 部门区域 */}
          {zones.map((z) => (
            <ZoneShape key={z.id} zone={z} departments={departments} dimmed={zoneDimmed(z.departmentId)} k={transform.k} />
          ))}

          {/* 墙、门 */}
          <WallsAndDoors derived={derived} k={transform.k} />

          {/* 物件、文字 */}
          {decor.elements.map((el) => {
            switch (el.kind) {
              case "furniture":
                return <ObjectGlyph key={el.id} item={el} lod={lod} k={transform.k} />;
              case "label":
                return <LabelText key={el.id} label={el} />;
              default:
                return null;
            }
          })}

          {/* 座位 */}
          {seats.map((s) => {
            const emp = s.employeeId ? (employees[s.employeeId] ?? null) : null;
            const dept = emp?.departmentId ? (departments[emp.departmentId] ?? null) : null;
            const dimmed = Boolean(highlightDeptId && (!emp || emp.departmentId !== highlightDeptId));
            return (
              <SeatGlyph
                key={s.id}
                seat={s}
                employee={emp}
                department={dept}
                lod={lod}
                hovered={hoveredSeatId === s.id}
                selected={selectedSeatId === s.id}
                dimmed={dimmed || dragging?.fromSeatId === s.id}
                dropTarget={dragOverSeatId === s.id && dragging?.fromSeatId !== s.id}
              />
            );
          })}

          <RoomLabels rooms={rooms} k={transform.k} />

          {/* 定位脉冲 */}
          {pulseSeat && (
            <rect
              key={pulseSeatId}
              className="seat-pulse"
              x={pulseSeat.x - 6}
              y={pulseSeat.y - 6}
              width={pulseSeat.w + 12}
              height={pulseSeat.h + 12}
              rx={12}
              fill="none"
              stroke="var(--info)"
              transform={pulseSeat.rotation ? `rotate(${pulseSeat.rotation} ${pulseSeat.x + pulseSeat.w / 2} ${pulseSeat.y + pulseSeat.h / 2})` : undefined}
              style={{ pointerEvents: "none" }}
            />
          )}
          {children}
        </g>
      </svg>

      {tooltipSeat && (
        <SeatTooltip
          seat={tooltipSeat}
          employee={tooltipSeat.employeeId ? (employees[tooltipSeat.employeeId] ?? null) : null}
          departments={departments}
          left={tooltip!.left}
          top={tooltip!.top}
          containerWidth={tooltip!.containerW}
        />
      )}

      <div data-ui className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-xl border border-border bg-surface/90 p-1 shadow-lift backdrop-blur">
        <Button variant="ghost" size="icon-sm" aria-label="放大" onClick={() => zoomBy(1.4)}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="缩小" onClick={() => zoomBy(1 / 1.4)}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="适应窗口" onClick={() => fitToBounds(floorBounds, 32, true)}>
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
      <div data-ui className="pointer-events-none absolute bottom-3 left-14 rounded-md bg-surface/80 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur">
        {Math.round(transform.k * 100)}% · {Math.round(floor.width / 100)}×{Math.round(floor.height / 100)} m
      </div>
    </div>
  );
}
