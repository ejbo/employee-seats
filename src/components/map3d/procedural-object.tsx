"use client";

/**
 * ObjectSpec DSL 渲染器：
 * - <ProceduralObject> 单件（物件库道具、自定义物件预览）
 * - <ProceduralInstances> 整层批量：所有部件按形状分成 4 组实例（box / rbox / cylinder / sphere），
 *   单位几何体 + 每实例缩放 + 每实例颜色，整层工位只有几个 draw call。
 */
import { useMemo } from "react";
import * as THREE from "three";
import { Instance, Instances } from "@react-three/drei";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ObjectSpec, Part, PartShape } from "@/lib/map/object-spec";
import type { Palette3D } from "@/lib/map3d/palette";

const M = 0.01;

export interface ColorCtx {
  accent?: string | null;
  /** 显示器点亮 */
  lit?: boolean;
  /** 桌面颜色覆盖（预留 / 悬停） */
  deskOverride?: string | null;
  /** 向地板色混合的比例（部门筛选变暗） */
  dim?: number;
}

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
export function mixColor(a: string, b: string, t: number): string {
  _c1.set(a);
  _c2.set(b);
  return `#${_c1.lerp(_c2, t).getHexString()}`;
}

export function resolveColor(color: string, p: Palette3D, ctx: ColorCtx = {}): string {
  let out: string;
  if (!color.startsWith("$")) out = color;
  else {
    switch (color) {
      case "$desk":
        out = ctx.deskOverride ?? p.desk;
        break;
      case "$frame":
        out = p.deskEdge;
        break;
      case "$chair":
        out = ctx.accent ?? p.chair;
        break;
      case "$accent":
        out = ctx.accent ?? p.info;
        break;
      case "$screen":
        out = ctx.lit ? p.screenOn : p.monitor;
        break;
      case "$metal":
        out = p.metal;
        break;
      case "$leaf":
        out = p.leaf;
        break;
      case "$pot":
        out = p.pot;
        break;
      case "$wood":
        out = p.wood;
        break;
      case "$fabric":
        out = p.fabric;
        break;
      case "$glass":
        out = p.glass;
        break;
      default:
        out = p.desk;
    }
  }
  return ctx.dim ? mixColor(out, p.floor, ctx.dim) : out;
}

// ── 单位几何体 ───────────────────────────────────────────────────────────────
const UNIT: Record<PartShape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.06),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
};
export function unitGeometry(shape: PartShape): THREE.BufferGeometry {
  return UNIT[shape];
}

function partScale(part: Part): [number, number, number] {
  return [part.size[0] * M, part.size[1] * M, part.size[2] * M];
}
function partPos(part: Part): [number, number, number] {
  const p = part.pos ?? [0, 0, 0];
  return [p[0] * M, p[1] * M, p[2] * M];
}

// ── 单件 ───────────────────────────────────────────────────────────────────
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function materialFor(color: string, opacity: number, glassy: boolean): THREE.MeshStandardMaterial {
  const key = `${color}:${opacity}:${glassy ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: glassy ? 0.15 : 0.7, metalness: glassy ? 0.1 : 0, transparent: opacity < 1 || glassy, opacity: glassy ? Math.min(opacity, 0.35) : opacity, depthWrite: opacity >= 1 && !glassy });
    matCache.set(key, m);
  }
  return m;
}

export function ProceduralObject({
  spec,
  position,
  rotationY = 0,
  scale,
  p,
  ctx,
  opacity = 1,
}: {
  spec: ObjectSpec;
  position: [number, number, number];
  rotationY?: number;
  /** 脚印相对规格的缩放（用户改了物件尺寸） */
  scale?: [number, number, number];
  p: Palette3D;
  ctx?: ColorCtx;
  opacity?: number;
}) {
  const parts = useMemo(() => spec.parts.map((part) => ({ part, color: resolveColor(part.color, p, ctx), glassy: part.color === "$glass" })), [ctx, p, spec.parts]);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {parts.map(({ part, color, glassy }, i) => (
        <mesh key={i} geometry={UNIT[part.shape]} material={materialFor(color, opacity, glassy)} position={partPos(part)} rotation={part.rot ?? [0, 0, 0]} scale={partScale(part)} castShadow={!glassy} receiveShadow />
      ))}
    </group>
  );
}

// ── 批量实例 ─────────────────────────────────────────────────────────────────
export interface InstanceItem {
  key: string;
  spec: ObjectSpec;
  position: [number, number, number];
  rotationY: number;
  scale?: [number, number, number];
  ctx?: ColorCtx;
  transparent?: boolean;
}

const SHAPES: PartShape[] = ["box", "rbox", "cylinder", "sphere"];

function ShapeBatch({ shape, entries, p, transparent }: { shape: PartShape; entries: InstanceItem[]; p: Palette3D; transparent: boolean }) {
  const count = entries.reduce((n, it) => n + it.spec.parts.filter((pt) => pt.shape === shape).length, 0);
  if (count === 0) return null;
  return (
    <Instances limit={Math.max(count, 1)} castShadow={!transparent} receiveShadow frustumCulled={false}>
      <primitive object={UNIT[shape]} attach="geometry" />
      <meshStandardMaterial color="#ffffff" roughness={0.7} transparent={transparent} opacity={transparent ? 0.4 : 1} depthWrite={!transparent} />
      {entries.map((it) => (
        <group key={it.key} position={it.position} rotation={[0, it.rotationY, 0]} scale={it.scale}>
          {it.spec.parts.map((part, i) =>
            part.shape !== shape ? null : <Instance key={i} position={partPos(part)} rotation={part.rot ?? [0, 0, 0]} scale={partScale(part)} color={resolveColor(part.color, p, it.ctx)} />,
          )}
        </group>
      ))}
    </Instances>
  );
}

export function ProceduralInstances({ items, p }: { items: InstanceItem[]; p: Palette3D }) {
  const solid = useMemo(() => items.filter((it) => !it.transparent), [items]);
  const glassy = useMemo(() => items.filter((it) => it.transparent), [items]);
  return (
    <group>
      {SHAPES.map((shape) => (
        <ShapeBatch key={shape} shape={shape} entries={solid} p={p} transparent={false} />
      ))}
      {glassy.length > 0 && SHAPES.map((shape) => <ShapeBatch key={`t-${shape}`} shape={shape} entries={glassy} p={p} transparent />)}
    </group>
  );
}
