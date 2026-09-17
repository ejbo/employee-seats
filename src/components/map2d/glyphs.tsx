"use client";

import type { DepartmentSummary, DoorEl, EmployeeSummary, FurnitureEl, LabelEl, SeatEl, WallEl, ZoneEl } from "@/lib/map/types";
import { FURNITURE_LABELS, seatState } from "@/lib/map/types";
import { rectTransform, shortName } from "@/lib/map/geometry";
import { NEUTRAL_ZONE_COLOR } from "@/lib/map/colors";

/** 细节层级：0 只画色块；1 姓名；2 姓名 + 编号/工号 */
export type Lod = 0 | 1 | 2;

export function zoneColor(zone: ZoneEl, departments: Record<string, DepartmentSummary>): string {
  return zone.color ?? (zone.departmentId ? departments[zone.departmentId]?.color : undefined) ?? NEUTRAL_ZONE_COLOR;
}

export function ZoneShape({
  zone,
  departments,
  dimmed,
  selected,
  interactive,
  k = 1,
}: {
  zone: ZoneEl;
  departments: Record<string, DepartmentSummary>;
  dimmed: boolean;
  selected?: boolean;
  interactive?: boolean;
  /** 当前缩放，用来让区域名在屏幕上保持约 13px */
  k?: number;
}) {
  const color = zoneColor(zone, departments);
  const labelSize = Math.max(18, Math.min(60, 12 / k));
  const g = zone.geometry;
  const shapeProps = { fill: color, className: "zone-tint" as const };
  const outlineProps = { fill: "none", stroke: color, strokeOpacity: selected ? 0.9 : 0.35, strokeWidth: selected ? 4 : 2, strokeDasharray: selected ? undefined : "10 8" };
  let labelPos: { x: number; y: number };
  let shape: React.ReactNode;
  let outline: React.ReactNode;
  if (g.type === "rect") {
    const t = rectTransform(g.x, g.y, g.w, g.h, g.rotation ?? 0);
    shape = <rect width={g.w} height={g.h} rx={12} transform={t} {...shapeProps} />;
    outline = <rect width={g.w} height={g.h} rx={12} transform={t} {...outlineProps} />;
    labelPos = { x: g.x + 4, y: g.y - labelSize * 0.35 };
  } else {
    const pts = g.points.map((p) => p.join(",")).join(" ");
    shape = <polygon points={pts} {...shapeProps} />;
    outline = <polygon points={pts} {...outlineProps} />;
    const first = g.points[0] ?? [0, 0];
    labelPos = { x: first[0] + 4, y: first[1] - labelSize * 0.35 };
  }
  return (
    <g data-zone-id={zone.id} opacity={dimmed ? 0.3 : 1} className={interactive ? "cursor-pointer" : undefined}>
      {shape}
      {outline}
      <text x={labelPos.x} y={labelPos.y} fontSize={labelSize} fontWeight={600} fill={color} opacity={0.85} style={{ pointerEvents: "none" }}>
        {zone.name}
      </text>
    </g>
  );
}

export function WallPath({ wall, selected }: { wall: WallEl; selected?: boolean }) {
  const pts = wall.points.map((p) => p.join(",")).join(" ");
  return (
    <g data-decor-id={wall.id}>
      {selected && (
        <polyline points={pts} fill="none" stroke="var(--info)" strokeOpacity={0.5} strokeWidth={wall.thickness + 12} strokeLinejoin="round" strokeLinecap="round" />
      )}
      <polyline points={pts} fill="none" stroke="var(--map-wall)" strokeWidth={wall.thickness} strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
}

export function DoorGlyph({ door, selected }: { door: DoorEl; selected?: boolean }) {
  const w = door.w;
  const s = door.flip ? -1 : 1;
  return (
    <g data-decor-id={door.id} transform={`translate(${door.x} ${door.y}) rotate(${door.rotation})`}>
      {/* 墙上的开口（用地板色盖住墙线） */}
      <line x1={0} y1={0} x2={w} y2={0} stroke="var(--map-floor)" strokeWidth={30} />
      <path d={`M ${w} 0 A ${w} ${w} 0 0 ${s > 0 ? 0 : 1} 0 ${-w * s}`} fill="none" stroke="var(--map-wall)" strokeWidth={2} strokeDasharray="6 5" />
      <line x1={0} y1={0} x2={0} y2={-w * s} stroke="var(--map-wall)" strokeWidth={5} strokeLinecap="round" />
      {selected && <rect x={-6} y={s > 0 ? -w - 6 : -6} width={w + 12} height={w + 12} fill="none" stroke="var(--info)" strokeWidth={3} strokeDasharray="8 6" />}
    </g>
  );
}

export function FurnitureGlyph({ item, selected, lod, k = 1 }: { item: FurnitureEl; selected?: boolean; lod: Lod; k?: number }) {
  const room = item.type === "meeting" || item.type === "pantry" || item.type === "restroom" || item.type === "storage" || item.type === "elevator" || item.type === "stairs" || item.type === "reception";
  const label = item.name || FURNITURE_LABELS[item.type];
  const fontSize = Math.min(Math.max(12, Math.min(item.w, item.h) / 4), Math.max(14, 13 / k));
  const showLabel = lod >= 1 || item.w * k >= 56;
  return (
    <g data-decor-id={item.id} transform={rectTransform(item.x, item.y, item.w, item.h, item.rotation)}>
      <rect
        width={item.w}
        height={item.h}
        rx={room ? 10 : 6}
        fill={room ? "var(--surface-2)" : "var(--muted)"}
        stroke={selected ? "var(--info)" : "var(--border-strong)"}
        strokeWidth={selected ? 4 : 2}
      />
      {room && <rect x={6} y={6} width={item.w - 12} height={item.h - 12} rx={6} fill="none" stroke="var(--border)" strokeWidth={1.5} />}
      {showLabel && (
        <text x={item.w / 2} y={item.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight={500} fill="var(--muted-foreground)" style={{ pointerEvents: "none" }}>
          {label}
        </text>
      )}
    </g>
  );
}

export function LabelText({ label, selected }: { label: LabelEl; selected?: boolean }) {
  return (
    <g data-decor-id={label.id} transform={`translate(${label.x} ${label.y}) rotate(${label.rotation})`}>
      {selected && <rect x={-6} y={-label.fontSize - 4} width={label.text.length * label.fontSize + 12} height={label.fontSize * 1.4 + 8} fill="none" stroke="var(--info)" strokeWidth={2} strokeDasharray="6 5" />}
      <text fontSize={label.fontSize} fontWeight={600} fill={label.color ?? "var(--muted-foreground)"} letterSpacing={label.fontSize * 0.06}>
        {label.text}
      </text>
    </g>
  );
}

export interface SeatGlyphProps {
  seat: SeatEl;
  employee: EmployeeSummary | null;
  department: DepartmentSummary | null;
  lod: Lod;
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
  dropTarget?: boolean;
  interactive?: boolean;
}

export function SeatGlyph({ seat, employee, department, lod, hovered, selected, dimmed, dropTarget, interactive = true }: SeatGlyphProps) {
  const state = seatState(seat);
  const { w, h } = seat;
  const deptColor = department?.color ?? NEUTRAL_ZONE_COLOR;
  const rot = ((seat.rotation % 360) + 360) % 360;
  const flipText = rot > 90 && rot < 270;
  const stroke = selected ? "var(--info)" : dropTarget ? "var(--success)" : hovered ? "var(--border-strong)" : "var(--seat-stroke)";
  const strokeWidth = selected || dropTarget ? 4 : hovered ? 2.5 : 1.5;
  const name = employee ? shortName(employee.name) : "";
  const fontSize = Math.min(18, Math.max(10, h * 0.3));
  const subSize = Math.max(8, fontSize * 0.62);

  return (
    <g
      data-seat-id={seat.id}
      transform={rectTransform(seat.x, seat.y, w, h, seat.rotation)}
      opacity={dimmed ? 0.28 : state === "disabled" ? 0.55 : 1}
      className={interactive ? "cursor-pointer" : undefined}
      style={{ filter: hovered && !selected ? "drop-shadow(0 2px 3px rgba(0,0,0,.18))" : undefined }}
    >
      <rect width={w} height={h} rx={Math.min(8, h / 6)} fill={state === "free" ? "var(--seat-fill)" : "var(--seat-fill)"} stroke={stroke} strokeWidth={strokeWidth} />
      {state === "occupied" && lod === 0 && <rect x={2} y={2} width={w - 4} height={h - 4} rx={5} fill={deptColor} opacity={0.4} />}
      {state === "occupied" && lod >= 1 && <rect x={4} y={4} width={5} height={h - 8} rx={2.5} fill={deptColor} />}
      {state === "reserved" && <rect width={w} height={h} rx={Math.min(8, h / 6)} fill="url(#seat-hatch)" />}
      {state === "disabled" && (
        <>
          <line x1={6} y1={6} x2={w - 6} y2={h - 6} stroke="var(--seat-sub)" strokeWidth={1.5} />
          <line x1={w - 6} y1={6} x2={6} y2={h - 6} stroke="var(--seat-sub)" strokeWidth={1.5} />
        </>
      )}
      {lod >= 1 && (
        <g transform={flipText ? `rotate(180 ${w / 2} ${h / 2})` : undefined} style={{ pointerEvents: "none" }}>
          {state === "occupied" && employee ? (
            <>
              <text x={w / 2 + 3} y={lod >= 2 ? h / 2 - subSize * 0.55 : h / 2} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight={600} fill="var(--seat-text)">
                {name}
              </text>
              {lod >= 2 && (
                <text x={w / 2 + 3} y={h / 2 + fontSize * 0.62} textAnchor="middle" dominantBaseline="central" fontSize={subSize} fill="var(--seat-sub)" fontFamily="var(--font-mono)">
                  {seat.code} · {employee.employeeNo}
                </text>
              )}
            </>
          ) : (
            <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fontSize={subSize + 1} fill="var(--seat-sub)" fontFamily="var(--font-mono)">
              {seat.code}
              {state === "reserved" ? " 预留" : state === "disabled" ? " 停用" : ""}
            </text>
          )}
        </g>
      )}
    </g>
  );
}
