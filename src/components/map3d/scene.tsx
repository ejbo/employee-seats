"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { DoorEl, FloorScene, FurnitureEl, SeatEl, WallEl, ZoneEl } from "@/lib/map/types";
import { FURNITURE_LABELS, seatState } from "@/lib/map/types";
import { NEUTRAL_ZONE_COLOR } from "@/lib/map/colors";
import { shortName } from "@/lib/map/geometry";
import { useViewStore } from "@/stores/view-store";
import { useTheme } from "@/components/theme/theme-provider";
import { labelTexture } from "@/lib/map3d/label-texture";
import { readPalette, type Palette3D } from "@/lib/map3d/palette";
import { SeatTooltip } from "@/components/floor/seat-tooltip";
import { Button } from "@/components/ui/button";

/** 厘米 → 米；2D 的 y（向下）→ 3D 的 z */
const M = 0.01;
const DESK_H = 0.72;
const WALL_H = 1.2;
const ROOM_H = 2.4;

function rectCenter(x: number, y: number, w: number, h: number): [number, number] {
  return [(x + w / 2) * M, (y + h / 2) * M];
}

// ── 地板 + 网格 ──────────────────────────────────────────────────────────────
function FloorSlab({ w, h, p, grid }: { w: number; h: number; p: Palette3D; grid: number }) {
  const W = w * M;
  const H = h * M;
  const gridTex = useMemo(() => {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = p.floor;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = p.grid;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    const step = Math.max(50, grid * 5) * M;
    t.repeat.set(W / step, H / step);
    return t;
  }, [W, H, grid, p.floor, p.grid]);
  return (
    <group>
      <mesh position={[W / 2, -0.02, H / 2]} receiveShadow>
        <boxGeometry args={[W, 0.04, H]} />
        <meshStandardMaterial color={p.floor} map={gridTex} roughness={0.95} />
      </mesh>
    </group>
  );
}

// ── 区域淡色 ────────────────────────────────────────────────────────────────
function ZonePatch({ zone, color, dimmed, p }: { zone: ZoneEl; color: string; dimmed: boolean; p: Palette3D }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    if (zone.geometry.type === "rect") {
      const { x, y, w, h } = zone.geometry;
      shape.moveTo(x * M, y * M);
      shape.lineTo((x + w) * M, y * M);
      shape.lineTo((x + w) * M, (y + h) * M);
      shape.lineTo(x * M, (y + h) * M);
      shape.closePath();
    } else {
      zone.geometry.points.forEach(([px, py], i) => (i === 0 ? shape.moveTo(px * M, py * M) : shape.lineTo(px * M, py * M)));
      shape.closePath();
    }
    return new THREE.ShapeGeometry(shape);
  }, [zone.geometry]);
  const rot = zone.geometry.type === "rect" ? ((zone.geometry.rotation ?? 0) * Math.PI) / 180 : 0;
  const [cx, cz] = zone.geometry.type === "rect" ? rectCenter(zone.geometry.x, zone.geometry.y, zone.geometry.w, zone.geometry.h) : [0, 0];
  const label = useMemo(() => labelTexture(zone.name, "", { fg: color, sub: color, bg: "rgba(0,0,0,0)" }), [zone.name, color]);
  const labelPos = zone.geometry.type === "rect" ? [zone.geometry.x * M + 0.9, 0.012, zone.geometry.y * M - 0.25] : [zone.geometry.points[0][0] * M + 0.9, 0.012, zone.geometry.points[0][1] * M - 0.25];
  return (
    <group>
      {/* ShapeGeometry 在 XY 平面，旋转到 XZ 平面（贴地） */}
      <group position={[cx, 0.006, cz]} rotation={[0, -rot, 0]}>
        <mesh geometry={geometry} position={[-cx, 0, -cz]} rotation={[Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.06 : p.isDark ? 0.22 : 0.16} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      </group>
      <mesh position={labelPos as [number, number, number]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.8, 0.9]} />
        <meshBasicMaterial map={label} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── 墙 / 门 / 家具 ──────────────────────────────────────────────────────────
function Wall({ wall, p }: { wall: WallEl; p: Palette3D }) {
  const t = Math.max(0.05, wall.thickness * M);
  const segs = useMemo(() => {
    const out: { cx: number; cz: number; len: number; angle: number }[] = [];
    for (let i = 0; i < wall.points.length - 1; i++) {
      const [x1, y1] = wall.points[i];
      const [x2, y2] = wall.points[i + 1];
      const dx = (x2 - x1) * M;
      const dz = (y2 - y1) * M;
      out.push({ cx: ((x1 + x2) / 2) * M, cz: ((y1 + y2) / 2) * M, len: Math.hypot(dx, dz), angle: -Math.atan2(dz, dx) });
    }
    return out;
  }, [wall.points]);
  return (
    <group>
      {segs.map((s, i) => (
        <mesh key={i} position={[s.cx, WALL_H / 2, s.cz]} rotation={[0, s.angle, 0]} castShadow receiveShadow>
          <boxGeometry args={[s.len + t, WALL_H, t]} />
          <meshStandardMaterial color={p.wall} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Door({ door, p }: { door: DoorEl; p: Palette3D }) {
  const w = door.w * M;
  return (
    <group position={[door.x * M, 0, door.y * M]} rotation={[0, (-door.rotation * Math.PI) / 180, 0]}>
      <mesh position={[0, 1.05, door.flip ? w / 2 : -w / 2]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[w, 2.1, 0.05]} />
        <meshStandardMaterial color={p.deskEdge} roughness={0.7} />
      </mesh>
    </group>
  );
}

function Furniture({ item, p }: { item: FurnitureEl; p: Palette3D }) {
  const room = item.type !== "printer" && item.type !== "custom";
  const h = room ? ROOM_H : 1.0;
  const [cx, cz] = rectCenter(item.x, item.y, item.w, item.h);
  const label = useMemo(() => labelTexture(item.name || FURNITURE_LABELS[item.type], "", { fg: p.sub, sub: p.sub, bg: "rgba(0,0,0,0)" }), [item.name, item.type, p.sub]);
  const lw = Math.min(item.w * M * 0.9, 3);
  return (
    <group position={[cx, 0, cz]} rotation={[0, (-item.rotation * Math.PI) / 180, 0]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[item.w * M, h, item.h * M]} />
        <meshStandardMaterial color={p.room} transparent opacity={room ? 0.35 : 0.9} roughness={0.9} />
      </mesh>
      <lineSegments position={[0, h / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(item.w * M, h, item.h * M)]} />
        <lineBasicMaterial color={p.roomEdge} />
      </lineSegments>
      <mesh position={[0, h + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[lw, lw / 2]} />
        <meshBasicMaterial map={label} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── 工位 ────────────────────────────────────────────────────────────────────
function Desk({
  seat,
  name,
  sub,
  deptColor,
  hovered,
  selected,
  dimmed,
  p,
  onOver,
  onOut,
  onClick,
}: {
  seat: SeatEl;
  name: string;
  sub: string;
  deptColor: string | null;
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
  p: Palette3D;
  onOver: () => void;
  onOut: () => void;
  onClick: () => void;
}) {
  const state = seatState(seat);
  const w = seat.w * M;
  const d = seat.h * M;
  const [cx, cz] = rectCenter(seat.x, seat.y, seat.w, seat.h);
  const occupied = state === "occupied";
  const label = useMemo(
    () => labelTexture(occupied ? name : seat.code, occupied ? sub : state === "free" ? "" : state === "reserved" ? "预留" : "停用", { fg: p.text, sub: p.sub, bg: p.surface, accent: occupied ? deptColor : null }),
    [occupied, name, seat.code, sub, state, p.text, p.sub, p.surface, deptColor],
  );
  const opacity = dimmed ? 0.25 : 1;
  const chairColor = occupied && deptColor ? deptColor : p.chair;
  return (
    <group
      position={[cx, 0, cz]}
      rotation={[0, (-seat.rotation * Math.PI) / 180, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onOver();
      }}
      onPointerOut={onOut}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* 桌面 */}
      <mesh position={[0, DESK_H, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.04, d]} />
        <meshStandardMaterial color={hovered || selected ? p.info : p.desk} transparent opacity={opacity} roughness={0.6} />
      </mesh>
      {/* 桌腿板 */}
      <mesh position={[0, DESK_H / 2, -d / 2 + 0.02]}>
        <boxGeometry args={[w * 0.96, DESK_H, 0.03]} />
        <meshStandardMaterial color={p.deskEdge} transparent opacity={opacity * 0.9} />
      </mesh>
      {/* 显示器 */}
      {state !== "disabled" && (
        <mesh position={[0, DESK_H + 0.22, -d / 2 + 0.12]}>
          <boxGeometry args={[Math.min(0.55, w * 0.45), 0.34, 0.03]} />
          <meshStandardMaterial color={p.monitor} transparent opacity={opacity} />
        </mesh>
      )}
      {/* 椅子 */}
      <group position={[0, 0, d / 2 + 0.28]}>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.06, 20]} />
          <meshStandardMaterial color={chairColor} transparent opacity={opacity} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.72, 0.2]}>
          <boxGeometry args={[0.42, 0.5, 0.05]} />
          <meshStandardMaterial color={chairColor} transparent opacity={opacity} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
          <meshStandardMaterial color={p.deskEdge} transparent opacity={opacity} />
        </mesh>
      </group>
      {/* 名牌（贴在桌面上） */}
      <mesh position={[0, DESK_H + 0.025, d * 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.min(w * 0.85, 1.1), Math.min(w * 0.85, 1.1) / 2]} />
        <meshBasicMaterial map={label} transparent opacity={opacity} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.01, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.62, Math.max(w, d) * 0.7, 48]} />
          <meshBasicMaterial color={p.info} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

// ── 相机：等轴测默认视角 + 定位飞行 ────────────────────────────────────────────
function CameraRig({ scene, controlsRef }: { scene: FloorScene; controlsRef: React.RefObject<CameraControls | null> }) {
  const { size, camera } = useThree();
  const flyTo = useViewStore((s) => s.flyTo);
  const setPulse = useViewStore((s) => s.setPulse);
  const fittedRef = useRef<string | null>(null);
  const W = scene.floor.width * M;
  const H = scene.floor.height * M;

  const fit = useCallback(
    (animated: boolean) => {
      const c = controlsRef.current;
      if (!c || !size.width || !size.height) return false;
      const cx = W / 2;
      const cz = H / 2;
      const dist = Math.max(W, H);
      void c.setLookAt(cx + dist * 0.8, dist * 0.9, cz + dist * 0.8, cx, 0, cz, animated);
      // 正交相机：zoom = 像素/米；按楼层对角线粗略放进视口，并给个下限避免 0/NaN
      const diag = Math.hypot(W, H);
      const zoom = Math.max(4, Math.min(size.width, size.height) / (diag * 0.85));
      void c.zoomTo(zoom, animated);
      return true;
    },
    [W, H, controlsRef, size.height, size.width],
  );

  // 容器量到尺寸后再做首次适配（R3F 初始 size 可能是 0）
  useEffect(() => {
    if (fittedRef.current === scene.floor.id) return;
    if (fit(false)) fittedRef.current = scene.floor.id;
  }, [fit, scene.floor.id]);

  useEffect(() => {
    if (!flyTo) return;
    const seat = scene.seats.find((s) => s.id === flyTo.seatId);
    const c = controlsRef.current;
    if (!seat || !c) return;
    const [cx, cz] = rectCenter(seat.x, seat.y, seat.w, seat.h);
    const dist = 8;
    void c.setLookAt(cx + dist * 0.8, dist * 0.9, cz + dist * 0.8, cx, DESK_H, cz, true);
    void c.zoomTo(Math.max(20, Math.min(size.width, size.height) / 6), true);
    setPulse(seat.id);
    const t = setTimeout(() => setPulse(null), 2000);
    return () => clearTimeout(t);
  }, [flyTo, scene.seats, controlsRef, size.width, size.height, setPulse]);

  void camera;
  return null;
}

export function Scene3D({ scene, onSeatClick }: { scene: FloorScene; onSeatClick?: (seatId: string) => void }) {
  const { theme } = useTheme();
  const [palette, setPalette] = useState<Palette3D>(() => readPalette());
  useEffect(() => {
    // 主题切换后 CSS 变量已经变了，重新读取
    const id = requestAnimationFrame(() => setPalette(readPalette()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  const hoveredSeatId = useViewStore((s) => s.hoveredSeatId);
  const selectedSeatId = useViewStore((s) => s.selectedSeatId);
  const highlightDeptId = useViewStore((s) => s.highlightDeptId);
  const setHovered = useViewStore((s) => s.setHovered);
  const controlsRef = useRef<CameraControls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ seatId: string; left: number; top: number; containerW: number } | null>(null);

  const { floor, seats, zones, decor, employees, departments } = scene;
  const zoneColor = (z: ZoneEl) => z.color ?? (z.departmentId ? departments[z.departmentId]?.color : undefined) ?? NEUTRAL_ZONE_COLOR;
  const hoveredSeat = hoveredSeatId ? seats.find((s) => s.id === hoveredSeatId) : null;

  const onMove = (e: React.PointerEvent) => {
    if (!hoveredSeatId) return;
    const rect = containerRef.current?.getBoundingClientRect();
    setTooltip({ seatId: hoveredSeatId, left: e.clientX - (rect?.left ?? 0), top: e.clientY - (rect?.top ?? 0), containerW: rect?.width ?? 0 });
  };

  return (
    <div ref={containerRef} className="relative h-full w-full bg-map-canvas" onPointerMove={onMove}>
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 2]}
        shadows
        camera={{ zoom: 40, position: [20, 20, 20], near: -200, far: 400 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
        onPointerMissed={() => setHovered(null)}
        style={{ background: palette.canvas }}
      >
        <color attach="background" args={[palette.canvas]} />
        <ambientLight intensity={palette.isDark ? 0.9 : 1.1} />
        <directionalLight position={[30, 50, 20]} intensity={palette.isDark ? 0.8 : 1.2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} />
        <CameraControls ref={controlsRef} makeDefault minPolarAngle={Math.PI / 8} maxPolarAngle={Math.PI / 2.4} dollyToCursor smoothTime={0.25} />
        <CameraRig scene={scene} controlsRef={controlsRef} />

        <FloorSlab w={floor.width} h={floor.height} p={palette} grid={floor.gridSize} />
        {zones.map((z) => (
          <ZonePatch key={z.id} zone={z} color={zoneColor(z)} dimmed={Boolean(highlightDeptId && z.departmentId !== highlightDeptId)} p={palette} />
        ))}
        {decor.elements.map((el) => {
          switch (el.kind) {
            case "wall":
              return <Wall key={el.id} wall={el} p={palette} />;
            case "door":
              return <Door key={el.id} door={el} p={palette} />;
            case "furniture":
              return <Furniture key={el.id} item={el} p={palette} />;
            default:
              return null;
          }
        })}
        {seats.map((s) => {
          const emp = s.employeeId ? employees[s.employeeId] : null;
          const dept = emp?.departmentId ? departments[emp.departmentId] : null;
          return (
            <Desk
              key={s.id}
              seat={s}
              name={emp ? shortName(emp.name) : ""}
              sub={emp ? `${s.code} · ${emp.employeeNo}` : ""}
              deptColor={dept?.color ?? null}
              hovered={hoveredSeatId === s.id}
              selected={selectedSeatId === s.id}
              dimmed={Boolean(highlightDeptId && (!emp || emp.departmentId !== highlightDeptId))}
              p={palette}
              onOver={() => setHovered(s.id)}
              onOut={() => setHovered(null)}
              onClick={() => onSeatClick?.(s.id)}
            />
          );
        })}
      </Canvas>

      {hoveredSeat && tooltip && tooltip.seatId === hoveredSeat.id && (
        <SeatTooltip
          seat={hoveredSeat}
          employee={hoveredSeat.employeeId ? (employees[hoveredSeat.employeeId] ?? null) : null}
          departments={departments}
          left={tooltip.left}
          top={tooltip.top}
          containerWidth={tooltip.containerW}
        />
      )}

      <div data-ui className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-xl border border-border bg-surface/90 p-1 shadow-lift backdrop-blur">
        <Button variant="ghost" size="icon-sm" aria-label="放大" onClick={() => void controlsRef.current?.zoom(controlsRef.current.camera.zoom * 0.4, true)}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="缩小" onClick={() => void controlsRef.current?.zoom(-controlsRef.current.camera.zoom * 0.3, true)}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="重置视角"
          onClick={() => {
            const c = controlsRef.current;
            if (!c) return;
            const W = floor.width * M;
            const H = floor.height * M;
            const dist = Math.max(W, H);
            void c.setLookAt(W / 2 + dist * 0.8, dist * 0.9, H / 2 + dist * 0.8, W / 2, 0, H / 2, true);
            const el = containerRef.current;
            const diag = Math.hypot(W, H);
            void c.zoomTo(Math.max(4, Math.min(el?.clientWidth ?? 800, el?.clientHeight ?? 600) / (diag * 0.85)), true);
          }}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
      <div data-ui className="pointer-events-none absolute bottom-3 left-14 rounded-md bg-surface/80 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur">
        拖动旋转 · 右键平移 · 滚轮缩放
      </div>
    </div>
  );
}
