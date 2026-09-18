"use client";

/**
 * 蓝图图层：查看器与编辑器共用的底层渲染（纸面 / 网格 / 底图 / 房间地面 / 墙 / 门 / 房间标签）。
 * 编辑器需要命中测试时用 `wrap` 给每个房间 / 门包一层 data-id。
 */
import { useMemo } from "react";
import type { RoomEl } from "@/lib/map/types";
import { ROOM_TYPE_LABELS } from "@/lib/map/types";
import { withBasePath } from "@/lib/base-path";
import { polygonArea, polygonBounds, polygonCentroid } from "@/lib/map/rectilinear";
import type { DerivedWalls } from "@/lib/map/walls";
import { DoorGlyph, ROOM_FILL } from "./glyphs";

export interface PaperProps {
  width: number;
  height: number;
  gridSize: number;
  k: number;
  showGrid: boolean;
  background?: { key: string; x: number; y: number; w: number; h: number; opacity: number } | null;
  /** pattern id 前缀，避免同页多张图冲突 */
  idPrefix?: string;
}

/** 纸面 + 1 m 细线 + 网格点 + 底图。 */
export function BlueprintPaper({ width, height, gridSize, k, showGrid, background, idPrefix = "bp" }: PaperProps) {
  const gridStep = k < 0.5 ? gridSize * 5 : gridSize;
  const showDots = showGrid && k >= 0.25;
  const showMeters = k >= 0.12;
  return (
    <>
      <defs>
        <pattern id={`${idPrefix}-dots`} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
          <circle cx={0} cy={0} r={(1.2 / Math.max(0.3, k)) * 0.8} fill="var(--map-grid)" />
        </pattern>
        <pattern id={`${idPrefix}-meters`} width={100} height={100} patternUnits="userSpaceOnUse">
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="var(--bp-line)" strokeOpacity={0.06} strokeWidth={1 / Math.max(0.2, k)} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill="var(--bp-paper)" stroke="var(--border-strong)" strokeWidth={2 / k} />
      {showMeters && <rect x={0} y={0} width={width} height={height} fill={`url(#${idPrefix}-meters)`} style={{ pointerEvents: "none" }} />}
      {background && (
        <image
          href={withBasePath(`/api/files/${background.key}`)}
          x={background.x}
          y={background.y}
          width={background.w}
          height={background.h}
          opacity={background.opacity}
          preserveAspectRatio="none"
          style={{ pointerEvents: "none" }}
        />
      )}
      {showDots && <rect x={0} y={0} width={width} height={height} fill={`url(#${idPrefix}-dots)`} style={{ pointerEvents: "none" }} />}
    </>
  );
}

/** 房间地面（按类型淡色 + 图案），不含标签。 */
export function RoomFloors({
  rooms,
  k,
  selectedIds,
  invalidIds,
  wrap,
}: {
  rooms: RoomEl[];
  k: number;
  selectedIds?: Set<string>;
  /** 与其他房间重叠（拖拽预览变红） */
  invalidIds?: Set<string>;
  wrap?: (room: RoomEl, node: React.ReactNode) => React.ReactNode;
}) {
  return (
    <>
      {rooms.map((room) => {
        const pts = room.points.map((p) => p.join(",")).join(" ");
        const selected = selectedIds?.has(room.id);
        const invalid = invalidIds?.has(room.id);
        const pattern = room.type === "restroom" || room.type === "storage" ? "url(#room-hatch)" : room.type === "stairs" ? "url(#room-stripes)" : null;
        const node = (
          <g key={room.id} data-room-id={room.id}>
            <polygon points={pts} fill={invalid ? "var(--danger)" : ROOM_FILL[room.type]} fillOpacity={invalid ? 0.25 : 1} stroke={invalid ? "var(--danger)" : selected ? "var(--info)" : "none"} strokeWidth={selected || invalid ? 3 / k : 0} />
            {pattern && <polygon points={pts} fill={pattern} style={{ pointerEvents: "none" }} />}
            {room.type === "elevator" && room.points.length >= 4 && (
              <g style={{ pointerEvents: "none" }} stroke="var(--bp-line)" strokeWidth={1.5 / k} opacity={0.5}>
                <line x1={room.points[0][0]} y1={room.points[0][1]} x2={room.points[2][0]} y2={room.points[2][1]} />
                <line x1={room.points[1][0]} y1={room.points[1][1]} x2={room.points[3][0]} y2={room.points[3][1]} />
              </g>
            )}
          </g>
        );
        return wrap ? wrap(room, node) : node;
      })}
    </>
  );
}

/** 墙（一条合并 path）+ 斜墙 + 门。 */
export function WallsAndDoors({
  derived,
  k,
  selectedIds,
  wrapDoor,
}: {
  derived: DerivedWalls;
  k: number;
  selectedIds?: Set<string>;
  wrapDoor?: (doorId: string, node: React.ReactNode) => React.ReactNode;
}) {
  return (
    <>
      {derived.pathD && <path d={derived.pathD} fill="var(--bp-wall)" fillRule="nonzero" style={{ pointerEvents: "none" }} />}
      {derived.diagonals.map((d) => (
        <line key={d.id} x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke="var(--bp-wall)" strokeWidth={d.thickness} strokeLinecap="square" style={{ pointerEvents: "none" }} />
      ))}
      {derived.doors.map((geom) => {
        const node = <DoorGlyph key={geom.id} geom={geom} k={k} selected={selectedIds?.has(geom.id)} />;
        return wrapDoor ? wrapDoor(geom.id, node) : node;
      })}
    </>
  );
}

/** 房间标签：名称 + 尺寸 · 面积（画在座位之上，不接收指针）。 */
export function RoomLabels({ rooms, k }: { rooms: RoomEl[]; k: number }) {
  const labelSize = Math.max(16, Math.min(48, 13 / k));
  const items = useMemo(
    () =>
      rooms.map((room) => {
        const [cx, cy] = polygonCentroid(room.points);
        const b = polygonBounds(room.points);
        const area = polygonArea(room.points) / 10000;
        return { room, cx, cy, b, area };
      }),
    [rooms],
  );
  return (
    <g style={{ pointerEvents: "none" }}>
      {items.map(({ room, cx, cy, b, area }) => {
        const small = Math.min(b.w, b.h) * k < 70;
        if (small) return null;
        const showDims = b.w * k > 140;
        return (
          <g key={room.id}>
            <text x={cx} y={cy - (showDims ? labelSize * 0.2 : 0)} textAnchor="middle" dominantBaseline={showDims ? "auto" : "central"} fontSize={labelSize} fontWeight={600} fill="var(--bp-line)" opacity={0.9}>
              {room.name || ROOM_TYPE_LABELS[room.type]}
            </text>
            {showDims && (
              <text x={cx} y={cy + labelSize * 0.85} textAnchor="middle" fontSize={labelSize * 0.62} fill="var(--bp-line)" opacity={0.6} fontFamily="var(--font-mono)">
                {(b.w / 100).toFixed(1)}×{(b.h / 100).toFixed(1)} m · {area.toFixed(1)} m²
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
