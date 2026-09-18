"use client";

/**
 * 房间地面（程序化贴图）、实例化墙块 + 顶盖、门框 + 门扇。
 */
import { useEffect, useMemo } from "react";
import { Instance, Instances } from "@react-three/drei";
import * as THREE from "three";
import type { RoomEl } from "@/lib/map/types";
import { ROOM_TYPE_LABELS } from "@/lib/map/types";
import { polygonCentroid } from "@/lib/map/rectilinear";
import type { DerivedWalls } from "@/lib/map/walls";
import type { DoorGeom } from "@/lib/map/doors";
import { labelTexture } from "@/lib/map3d/label-texture";
import type { Palette3D } from "@/lib/map3d/palette";
import { floorTextureKind, getFloorTexture } from "@/lib/map3d/textures";

const M = 0.01;
/** 剖切高度：墙只到 1.1m，不挡座位 */
export const WALL_H = 1.1;
const CAP_H = 0.02;

export function RoomFloor({ room, p }: { room: RoomEl; p: Palette3D }) {
  const shape = useMemo(() => {
    const sh = new THREE.Shape();
    room.points.forEach(([x, y], i) => (i === 0 ? sh.moveTo(x * M, y * M) : sh.lineTo(x * M, y * M)));
    sh.closePath();
    return sh;
  }, [room.points]);
  const kind = floorTextureKind(room);
  const texture = kind === "plain" ? null : getFloorTexture(kind, p.isDark);
  const [cx, cy] = useMemo(() => polygonCentroid(room.points), [room.points]);
  const label = useMemo(() => labelTexture(room.name || ROOM_TYPE_LABELS[room.type], "", { fg: p.sub, sub: p.sub, bg: "rgba(0,0,0,0)" }), [room.name, room.type, p.sub]);
  useEffect(() => () => label.dispose(), [label]);
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        {texture ? <meshStandardMaterial map={texture} roughness={0.95} side={THREE.DoubleSide} /> : <meshStandardMaterial color={p.room} roughness={0.95} side={THREE.DoubleSide} />}
      </mesh>
      <mesh position={[cx * M, 0.012, cy * M]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 1.2]} />
        <meshBasicMaterial map={label} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** 墙块：单位盒实例按块缩放；顶盖是第二组实例（略宽、略亮）。 */
export function WallsInstanced({ derived, p }: { derived: DerivedWalls; p: Palette3D }) {
  const items = useMemo(() => {
    const out = derived.pieces.map((w) => ({ position: [(w.x + w.w / 2) * M, WALL_H / 2, (w.y + w.h / 2) * M] as [number, number, number], scale: [w.w * M, WALL_H, w.h * M] as [number, number, number], rotation: 0 }));
    for (const d of derived.diagonals) {
      const dx = (d.b[0] - d.a[0]) * M;
      const dz = (d.b[1] - d.a[1]) * M;
      out.push({ position: [((d.a[0] + d.b[0]) / 2) * M, WALL_H / 2, ((d.a[1] + d.b[1]) / 2) * M], scale: [Math.hypot(dx, dz) + d.thickness * M, WALL_H, d.thickness * M], rotation: -Math.atan2(dz, dx) });
    }
    return out;
  }, [derived]);
  if (!items.length) return null;
  return (
    <group>
      <Instances limit={items.length} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={p.wall} roughness={0.85} />
        {items.map((it, i) => (
          <Instance key={i} position={it.position} scale={it.scale} rotation={[0, it.rotation, 0]} />
        ))}
      </Instances>
      <Instances limit={items.length}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={p.wallCap} roughness={0.6} />
        {items.map((it, i) => (
          <Instance key={i} position={[it.position[0], WALL_H + CAP_H / 2, it.position[2]]} scale={[it.scale[0] + 0.02, CAP_H, it.scale[2] + 0.02]} rotation={[0, it.rotation, 0]} />
        ))}
      </Instances>
    </group>
  );
}

/** 门：门框两侧 + 门楣，门扇绕铰链开 35°。 */
export function Doors({ doors, p }: { doors: DoorGeom[]; p: Palette3D }) {
  if (!doors.length) return null;
  return (
    <group>
      {doors.map((geom) => {
        const w = geom.w * M;
        const cx = ((geom.a[0] + geom.b[0]) / 2) * M;
        const cz = ((geom.a[1] + geom.b[1]) / 2) * M;
        const t = Math.max(0.06, geom.thickness * M);
        const hingeX = geom.hinge === "start" ? -w / 2 : w / 2;
        const open = ((geom.hinge === "start" ? 1 : -1) * geom.swingSign * 35 * Math.PI) / 180;
        return (
          <group key={geom.id} position={[cx, 0, cz]} rotation={[0, (-geom.rotation * Math.PI) / 180, 0]}>
            <mesh position={[-w / 2 - 0.02, WALL_H / 2, 0]} castShadow>
              <boxGeometry args={[0.04, WALL_H, t + 0.02]} />
              <meshStandardMaterial color={p.frame} roughness={0.7} />
            </mesh>
            <mesh position={[w / 2 + 0.02, WALL_H / 2, 0]} castShadow>
              <boxGeometry args={[0.04, WALL_H, t + 0.02]} />
              <meshStandardMaterial color={p.frame} roughness={0.7} />
            </mesh>
            <group position={[hingeX, 0, 0]} rotation={[0, open, 0]}>
              <mesh position={[geom.hinge === "start" ? w / 2 : -w / 2, WALL_H / 2, 0]} castShadow>
                <boxGeometry args={[w, WALL_H, 0.04]} />
                <meshStandardMaterial color={p.doorLeaf} roughness={0.55} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}
