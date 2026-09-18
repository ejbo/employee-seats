"use client";

/**
 * glTF 道具：加载随仓库分发的模型，按物件脚印 (w × d) 与高度等比缩放并落到地面。
 * 加载中 / 失败时由调用方用程序化规格兜底（Suspense fallback + ErrorBoundary）。
 */
import { Component, Suspense, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { withBasePath } from "@/lib/base-path";
import { GLB_PROPS } from "@/lib/map/glb-props";

const M = 0.01;

function Model({ url, w, d, h, flip }: { url: string; w: number; d: number; h: number; flip: boolean }) {
  const gltf = useGLTF(url, false, true);
  const { object, scale, offset } = useMemo(() => {
    const obj = gltf.scene.clone(true);
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    // 等比缩放：脚印按 w/d 里较紧的一边，再不超过高度
    const s = Math.min((w * M) / (size.x || 1), (d * M) / (size.z || 1), (h * M) / (size.y || 1));
    return { object: obj, scale: s, offset: [-center.x * s, -box.min.y * s, -center.z * s] as [number, number, number] };
  }, [gltf.scene, w, d, h]);
  return (
    <group scale={[flip ? -1 : 1, 1, 1]}>
      <primitive object={object} position={offset} scale={scale} />
    </group>
  );
}

class PropBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function GlbProp({ url, w, d, h, flip, fallback }: { url: string; w: number; d: number; h: number; flip: boolean; fallback: ReactNode }) {
  return (
    <PropBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Model url={withBasePath(url)} w={w} d={d} h={h} flip={flip} />
      </Suspense>
    </PropBoundary>
  );
}

/** 预加载常用模型（进入 3D 视图后台进行）。 */
export function preloadProps(): void {
  for (const url of Object.values(GLB_PROPS)) useGLTF.preload(withBasePath(url), false, true);
}
