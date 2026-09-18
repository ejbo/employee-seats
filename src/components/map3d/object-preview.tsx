"use client";

/** 物件规格的迷你 3D 预览（照片生成物件对话框用）。 */
import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { specHeight, type ObjectSpec } from "@/lib/map/object-spec";
import { readPalette, type Palette3D } from "@/lib/map3d/palette";
import { useTheme } from "@/components/theme/theme-provider";
import { ProceduralObject } from "./procedural-object";

export function ObjectPreview({ spec }: { spec: ObjectSpec }) {
  const { theme } = useTheme();
  const [palette, setPalette] = useState<Palette3D>(() => readPalette());
  useEffect(() => {
    const id = requestAnimationFrame(() => setPalette(readPalette()));
    return () => cancelAnimationFrame(id);
  }, [theme]);
  const size = Math.max(spec.footprint[0], spec.footprint[1], specHeight(spec)) * 0.01;
  return (
    <Canvas dpr={[1, 1.5]} shadows camera={{ position: [size * 1.6, size * 1.3, size * 1.8], fov: 40, near: 0.05, far: 50 }} gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }} style={{ background: palette.canvas }}>
      <hemisphereLight args={[palette.isDark ? "#3a3f4a" : "#ffffff", palette.isDark ? "#15151a" : "#cfd3d8", 0.9]} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color={palette.floor} roughness={0.95} />
      </mesh>
      <gridHelper args={[size * 4, Math.max(4, Math.round(size * 4)), palette.grid, palette.grid]} position={[0, 0.001, 0]} />
      <ProceduralObject spec={spec} position={[0, 0, 0]} p={palette} />
      <OrbitControls makeDefault target={[0, size * 0.4, 0]} enablePan={false} minDistance={size * 0.8} maxDistance={size * 6} />
    </Canvas>
  );
}
