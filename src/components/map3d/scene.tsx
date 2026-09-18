"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { AdaptiveDpr, CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { FloorScene, ZoneEl } from "@/lib/map/types";
import { catalogDef } from "@/lib/map/catalog";
import { deriveWalls } from "@/lib/map/walls";
import { Lighting, ToneMappingSync } from "./lighting";
import { Doors, RoomFloor, WallsInstanced } from "./rooms";
import { Workstations } from "./workstations";
import { ProceduralObject } from "./procedural-object";
import { specFor } from "@/lib/map/catalog";
import { NEUTRAL_ZONE_COLOR } from "@/lib/map/colors";
import { useViewStore } from "@/stores/view-store";
import { useTheme } from "@/components/theme/theme-provider";
import { labelTexture } from "@/lib/map3d/label-texture";
import { readPalette, type Palette3D } from "@/lib/map3d/palette";
import { SeatTooltip } from "@/components/floor/seat-tooltip";
import { Button } from "@/components/ui/button";

/** 厘米 → 米；2D 的 y（向下）→ 3D 的 z */
const M = 0.01;
const DESK_H = 0.72;

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
  const derived = useMemo(() => deriveWalls(decor.elements), [decor.elements]);
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
        dpr={[1, 1.5]}
        shadows
        camera={{ zoom: 40, position: [20, 20, 20], near: -200, far: 400 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
        onPointerMissed={() => setHovered(null)}
        style={{ background: palette.canvas }}
      >
        <color attach="background" args={[palette.canvas]} />
        <AdaptiveDpr pixelated />
        <ToneMappingSync isDark={palette.isDark} />
        <Lighting p={palette} floorW={floor.width} floorH={floor.height} bakeKey={`${floor.id}:${floor.version}:${palette.isDark ? "d" : "l"}`} />
        <CameraControls ref={controlsRef} makeDefault minPolarAngle={Math.PI / 8} maxPolarAngle={Math.PI / 2.4} dollyToCursor smoothTime={0.25} />
        <CameraRig scene={scene} controlsRef={controlsRef} />

        <FloorSlab w={floor.width} h={floor.height} p={palette} grid={floor.gridSize} />
        {zones.map((z) => (
          <ZonePatch key={z.id} zone={z} color={zoneColor(z)} dimmed={Boolean(highlightDeptId && z.departmentId !== highlightDeptId)} p={palette} />
        ))}
        <WallsInstanced derived={derived} p={palette} />
        <Doors doors={derived.doors} p={palette} />
        {decor.elements.map((el) => {
          switch (el.kind) {
            case "room":
              return <RoomFloor key={el.id} room={el} p={palette} />;
            case "furniture": {
              const def = catalogDef(el.typeKey);
              const spec = specFor(def);
              const sx = el.w / spec.footprint[0];
              const sz = el.h / spec.footprint[1];
              return <ProceduralObject key={el.id} spec={spec} position={[(el.x + el.w / 2) * M, 0, (el.y + el.h / 2) * M]} rotationY={(-el.rotation * Math.PI) / 180} scale={[el.flip ? -sx : sx, 1, sz]} p={palette} />;
            }
            default:
              return null;
          }
        })}
        <Workstations
          seats={seats}
          employees={employees}
          departments={departments}
          p={palette}
          hoveredSeatId={hoveredSeatId}
          selectedSeatId={selectedSeatId}
          highlightDeptId={highlightDeptId}
          onOver={setHovered}
          onOut={() => setHovered(null)}
          onClick={(id) => onSeatClick?.(id)}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.18) 100%)" }} />

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
