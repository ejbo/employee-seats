"use client";

import type { DepartmentSummary, EmployeeSummary, FurnitureEl, LabelEl, RoomEl, SeatEl, WallEl, ZoneEl } from "@/lib/map/types";
import { ROOM_TYPE_LABELS, seatState } from "@/lib/map/types";
import { rectTransform, shortName } from "@/lib/map/geometry";
import { NEUTRAL_ZONE_COLOR } from "@/lib/map/colors";
import { polygonArea, polygonCentroid } from "@/lib/map/rectilinear";
import type { DoorGeom } from "@/lib/map/doors";
import { catalogDef, type ObjectDef } from "@/lib/map/catalog";

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

// ── 房间 ────────────────────────────────────────────────────────────────────
export const ROOM_FILL: Record<RoomEl["type"], string> = {
  office: "var(--bp-room-office)",
  meeting: "var(--bp-room-meeting)",
  pantry: "var(--bp-room-pantry)",
  restroom: "var(--bp-room-restroom)",
  elevator: "var(--bp-room-elevator)",
  stairs: "var(--bp-room-stairs)",
  storage: "var(--bp-room-storage)",
  reception: "var(--bp-room-reception)",
  corridor: "var(--bp-room-corridor)",
  other: "var(--bp-room-other)",
};

export function RoomShape({ room, k = 1, selected, interactive, showLabel = true }: { room: RoomEl; k?: number; selected?: boolean; interactive?: boolean; showLabel?: boolean }) {
  const pts = room.points.map((p) => p.join(",")).join(" ");
  const [cx, cy] = polygonCentroid(room.points);
  const area = polygonArea(room.points) / 10000;
  const labelSize = Math.max(16, Math.min(48, 13 / k));
  const pattern = room.type === "restroom" || room.type === "storage" ? "url(#room-hatch)" : room.type === "stairs" ? "url(#room-stripes)" : null;
  return (
    <g data-room-id={room.id} className={interactive ? "cursor-pointer" : undefined}>
      <polygon points={pts} fill={ROOM_FILL[room.type]} stroke={selected ? "var(--info)" : "none"} strokeWidth={selected ? 3 / k : 0} />
      {pattern && <polygon points={pts} fill={pattern} style={{ pointerEvents: "none" }} />}
      {room.type === "elevator" && (
        <g style={{ pointerEvents: "none" }} stroke="var(--bp-line)" strokeWidth={1.5 / k} opacity={0.5}>
          <line x1={room.points[0][0]} y1={room.points[0][1]} x2={room.points[2][0]} y2={room.points[2][1]} />
          <line x1={room.points[1][0]} y1={room.points[1][1]} x2={room.points[3][0]} y2={room.points[3][1]} />
        </g>
      )}
      {showLabel && (
        <g style={{ pointerEvents: "none" }}>
          <text x={cx} y={cy - labelSize * 0.2} textAnchor="middle" fontSize={labelSize} fontWeight={600} fill="var(--bp-line)" opacity={0.9}>
            {room.name || ROOM_TYPE_LABELS[room.type]}
          </text>
          <text x={cx} y={cy + labelSize * 0.85} textAnchor="middle" fontSize={labelSize * 0.62} fill="var(--bp-line)" opacity={0.6} fontFamily="var(--font-mono)">
            {area.toFixed(1)} m²
          </text>
        </g>
      )}
    </g>
  );
}

// ── 墙 / 门 ─────────────────────────────────────────────────────────────────
export function WallPath({ wall, selected }: { wall: WallEl; selected?: boolean }) {
  const pts = wall.points.map((p) => p.join(",")).join(" ");
  return (
    <g data-decor-id={wall.id}>
      {selected && (
        <polyline points={pts} fill="none" stroke="var(--info)" strokeOpacity={0.5} strokeWidth={wall.thickness + 12} strokeLinejoin="round" strokeLinecap="round" />
      )}
      <polyline points={pts} fill="none" stroke="var(--bp-wall)" strokeWidth={wall.thickness} strokeLinejoin="miter" strokeLinecap="square" />
    </g>
  );
}

/** 门：门套 + 门扇 + 四分之一圆弧。geom 由 resolveDoor 得到。 */
export function DoorGlyph({ geom, selected, k = 1 }: { geom: DoorGeom; selected?: boolean; k?: number }) {
  const w = geom.w;
  const s = geom.swingSign; // +1 = 边右侧（屏幕坐标里向下 = +y）
  const hingeAtEnd = geom.hinge === "end";
  const t = Math.max(8, geom.thickness);
  // 本地坐标：边沿 +x，门段 0..w；门扇从铰链出发，打开 90° 指向摆动侧
  const hx = hingeAtEnd ? w : 0;
  const leafEndX = hx;
  const leafEndY = s * w;
  const arcEndX = hingeAtEnd ? 0 : w;
  const sweep = (s > 0) !== hingeAtEnd ? 1 : 0;
  return (
    <g data-decor-id={geom.id} transform={`translate(${geom.a[0]} ${geom.a[1]}) rotate(${geom.rotation})`}>
      {/* 开口：用地板色盖住墙 */}
      <line x1={0} y1={0} x2={w} y2={0} stroke="var(--bp-paper)" strokeWidth={t + 6} />
      {/* 门套 */}
      <rect x={-3} y={-t / 2} width={6} height={t} fill="var(--bp-wall)" />
      <rect x={w - 3} y={-t / 2} width={6} height={t} fill="var(--bp-wall)" />
      {/* 门扇 */}
      <line x1={hx} y1={0} x2={leafEndX} y2={leafEndY} stroke="var(--bp-wall)" strokeWidth={4} strokeLinecap="round" />
      {/* 弧 */}
      <path d={`M ${arcEndX} 0 A ${w} ${w} 0 0 ${sweep} ${leafEndX} ${leafEndY}`} fill="none" stroke="var(--bp-line)" strokeWidth={1.2 / k} strokeDasharray={`${5 / k} ${4 / k}`} opacity={0.8} />
      {selected && <rect x={-8} y={s > 0 ? -8 : -w - 8} width={w + 16} height={w + 16} fill="none" stroke="var(--info)" strokeWidth={2 / k} strokeDasharray={`${8 / k} ${6 / k}`} />}
      <rect x={-6} y={-t} width={w + 12} height={t * 2} fill="transparent" />
    </g>
  );
}

// ── 物件（物件库） ──────────────────────────────────────────────────────────
export function ObjectGlyph({ item, def, lod, k = 1, selected }: { item: FurnitureEl; def?: ObjectDef; lod: Lod; k?: number; selected?: boolean }) {
  const d = def ?? catalogDef(item.typeKey);
  const label = item.name || d.name;
  const fontSize = Math.min(Math.max(12, Math.min(item.w, item.h) / 4), Math.max(14, 13 / k));
  const showLabel = lod >= 1 || item.w * k >= 56;
  const stroke = selected ? "var(--info)" : "var(--bp-line)";
  const sw = selected ? 3 / k : 1.25 / k;
  const { w, h } = item;
  const body = (() => {
    switch (d.glyph) {
      case "table-round":
        return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="var(--bp-object)" stroke={stroke} strokeWidth={sw} />;
      case "plant":
        return (
          <>
            <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="var(--bp-plant)" stroke={stroke} strokeWidth={sw} />
            <path d={`M ${w / 2} ${h * 0.15} L ${w / 2} ${h * 0.85} M ${w * 0.2} ${h / 2} L ${w * 0.8} ${h / 2} M ${w * 0.28} ${h * 0.28} L ${w * 0.72} ${h * 0.72} M ${w * 0.72} ${h * 0.28} L ${w * 0.28} ${h * 0.72}`} stroke={stroke} strokeWidth={sw} opacity={0.6} />
          </>
        );
      case "chair":
        return (
          <>
            <rect x={w * 0.1} y={h * 0.15} width={w * 0.8} height={h * 0.7} rx={w * 0.2} fill="var(--bp-object)" stroke={stroke} strokeWidth={sw} />
            <rect x={w * 0.15} y={h * 0.05} width={w * 0.7} height={h * 0.18} rx={w * 0.08} fill="var(--bp-object-2)" stroke={stroke} strokeWidth={sw} />
          </>
        );
      case "sofa":
      case "armchair":
        return (
          <>
            <rect x={0} y={0} width={w} height={h} rx={8} fill="var(--bp-object)" stroke={stroke} strokeWidth={sw} />
            <rect x={w * 0.08} y={h * 0.3} width={w * 0.84} height={h * 0.62} rx={6} fill="var(--bp-object-2)" stroke={stroke} strokeWidth={sw} />
            {d.glyph === "sofa" && <line x1={w / 2} y1={h * 0.3} x2={w / 2} y2={h * 0.92} stroke={stroke} strokeWidth={sw} />}
          </>
        );
      case "desk":
      case "desk-l":
        return (
          <>
            <rect x={0} y={0} width={w} height={h} rx={4} fill="var(--bp-object)" stroke={stroke} strokeWidth={sw} />
            <rect x={w * 0.3} y={h * 0.08} width={w * 0.4} height={h * 0.08} fill="var(--bp-line)" opacity={0.6} />
          </>
        );
      case "whiteboard":
      case "screen":
      case "partition":
        return <rect x={0} y={0} width={w} height={h} fill={d.glyph === "screen" ? "var(--bp-line)" : "var(--bp-object)"} stroke={stroke} strokeWidth={sw} />;
      case "bookshelf":
      case "cabinet":
      case "locker":
      case "fridge":
        return (
          <>
            <rect x={0} y={0} width={w} height={h} fill="var(--bp-object)" stroke={stroke} strokeWidth={sw} />
            {d.glyph === "cabinet" || d.glyph === "fridge" ? <line x1={w / 2} y1={0} x2={w / 2} y2={h} stroke={stroke} strokeWidth={sw} /> : null}
            {d.glyph === "bookshelf" ? <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={stroke} strokeWidth={sw} /> : null}
          </>
        );
      default:
        return <rect x={0} y={0} width={w} height={h} rx={d.glyph === "box" ? 0 : 6} fill="var(--bp-object)" stroke={stroke} strokeWidth={sw} />;
    }
  })();
  return (
    <g data-decor-id={item.id} transform={rectTransform(item.x, item.y, w, h, item.rotation)}>
      {body}
      {showLabel && d.glyph !== "chair" && d.glyph !== "plant" && (
        <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight={500} fill="var(--bp-line)" opacity={0.85} style={{ pointerEvents: "none" }}>
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

// ── 座位 ────────────────────────────────────────────────────────────────────
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
  const lShape = seat.style === "desk-l" || seat.style === "desk-l-left";
  const rx = Math.min(8, h / 6);

  return (
    <g
      data-seat-id={seat.id}
      transform={rectTransform(seat.x, seat.y, w, h, seat.rotation)}
      opacity={dimmed ? 0.28 : state === "disabled" ? 0.55 : 1}
      className={interactive ? "cursor-pointer" : undefined}
      style={{ filter: hovered && !selected ? "drop-shadow(0 2px 3px rgba(0,0,0,.18))" : undefined }}
    >
      {lShape ? (
        <path
          d={
            seat.style === "desk-l"
              ? `M 0 0 H ${w} V ${h} H ${w * 0.55} V ${h * 0.55} H 0 Z`
              : `M 0 0 H ${w} V ${h * 0.55} H ${w * 0.45} V ${h} H 0 Z`
          }
          fill="var(--seat-fill)"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      ) : (
        <rect width={w} height={h} rx={rx} fill="var(--seat-fill)" stroke={stroke} strokeWidth={strokeWidth} />
      )}
      {seat.style === "bench" && <line x1={w / 2} y1={2} x2={w / 2} y2={h - 2} stroke="var(--seat-stroke)" strokeWidth={1} strokeDasharray="4 3" />}
      {state === "occupied" && lod === 0 && <rect x={2} y={2} width={w - 4} height={h - 4} rx={5} fill={deptColor} opacity={0.4} />}
      {state === "occupied" && lod >= 1 && <rect x={4} y={4} width={5} height={h - 8} rx={2.5} fill={deptColor} />}
      {state === "reserved" && <rect width={w} height={h} rx={rx} fill="url(#seat-hatch)" />}
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

/** 蓝图图层里通用的 pattern 定义（放在 <defs> 里）。 */
export function BlueprintDefs({ k }: { k: number }) {
  return (
    <>
      <pattern id="seat-hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={8} stroke="var(--seat-sub)" strokeOpacity={0.35} strokeWidth={2} />
      </pattern>
      <pattern id="room-hatch" width={24} height={24} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={24} stroke="var(--bp-line)" strokeOpacity={0.12} strokeWidth={1.5 / Math.max(0.2, k)} />
      </pattern>
      <pattern id="room-stripes" width={40} height={40} patternUnits="userSpaceOnUse">
        <line x1={0} y1={0} x2={40} y2={0} stroke="var(--bp-line)" strokeOpacity={0.18} strokeWidth={2 / Math.max(0.2, k)} />
      </pattern>
    </>
  );
}
