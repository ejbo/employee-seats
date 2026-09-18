"use client";

/**
 * 光照与色调：半球光 + 主方向光（阴影相机按楼层拟合）+ 程序化环境光（Lightformer，零文件）+ 接触阴影（当 AO 用）。
 */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, SoftShadows } from "@react-three/drei";
import * as THREE from "three";
import type { Palette3D } from "@/lib/map3d/palette";

const M = 0.01;

export function Lighting({ p, floorW, floorH, bakeKey, quality = "normal" }: { p: Palette3D; floorW: number; floorH: number; bakeKey: string; quality?: "normal" | "high" }) {
  const W = floorW * M;
  const H = floorH * M;
  const half = Math.max(W, H) * 0.75;
  return (
    <>
      <hemisphereLight args={[p.isDark ? "#3a3f4a" : "#ffffff", p.isDark ? "#15151a" : "#cfd3d8", p.isDark ? 0.55 : 0.85]} />
      <directionalLight
        position={[W / 2 + half * 0.6, half * 1.4, H / 2 + half * 0.8]}
        target-position={[W / 2, 0, H / 2]}
        intensity={p.isDark ? 1.4 : 2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={0.5}
        shadow-camera-far={half * 5}
        shadow-normalBias={0.03}
        shadow-bias={-0.0002}
      />
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={p.isDark ? 0.5 : 1.2} rotation-x={Math.PI / 2} position={[0, 6, 0]} scale={[12, 12, 1]} color={p.isDark ? "#8fa3c8" : "#ffffff"} />
        <Lightformer intensity={p.isDark ? 0.3 : 0.6} rotation-y={Math.PI / 2} position={[-8, 2, 0]} scale={[8, 3, 1]} color={p.isDark ? "#6b7a99" : "#e8edf5"} />
        <Lightformer intensity={p.isDark ? 0.25 : 0.5} rotation-y={-Math.PI / 2} position={[8, 2, 0]} scale={[8, 3, 1]} color={p.isDark ? "#8a7a6b" : "#f5efe6"} />
      </Environment>
      <ContactShadows key={bakeKey} position={[W / 2, 0.002, H / 2]} scale={[W + 2, H + 2]} blur={2.2} opacity={p.isDark ? 0.5 : 0.32} far={2.5} resolution={1024} frames={1} color={p.isDark ? "#000000" : "#2a2a35"} />
      {quality === "high" && <SoftShadows size={10} samples={12} focus={0.6} />}
    </>
  );
}

/** 色调映射曝光随主题变化（gl 属性只在创建时生效，这里手动同步）。 */
export function ToneMappingSync({ isDark }: { isDark: boolean }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, invalidate } = get();
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = isDark ? 0.85 : 1.05;
    invalidate();
  }, [get, isDark]);
  return null;
}
