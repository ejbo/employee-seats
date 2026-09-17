"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { clamp, fitTransform, type Bounds, type Transform } from "@/lib/map/geometry";

export interface Viewport {
  transform: Transform;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setTransform: (t: Transform) => void;
  /** 平滑过渡到目标变换。 */
  animateTo: (t: Transform, duration?: number) => void;
  fitToBounds: (b: Bounds, padding?: number, animated?: boolean, inset?: Inset) => void;
  zoomBy: (factor: number, center?: { x: number; y: number }) => void;
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  /** 拖拽平移：pointerdown 时调用，返回 move / end 处理器。 */
  beginPan: (clientX: number, clientY: number) => { move: (cx: number, cy: number) => void; end: () => void };
  size: { w: number; h: number };
}

export interface Inset {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const MIN_K = 0.03;
const MAX_K = 8;

export function useViewport(): Viewport {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransformState] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const animRef = useRef<{ stop: () => void } | null>(null);
  const pinchRef = useRef<{ dist: number; k: number; mid: { x: number; y: number }; origin: Transform } | null>(null);

  const setTransform = useCallback((t: Transform) => {
    animRef.current?.stop();
    setTransformState({ x: t.x, y: t.y, k: clamp(t.k, MIN_K, MAX_K) });
  }, []);

  // 容器尺寸
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 滚轮缩放（原生监听，才能 preventDefault 阻止页面滚动）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // 触控板捏合会带 ctrlKey 且 delta 小；普通滚轮 delta 大。统一按指数缩放。
      const intensity = e.ctrlKey ? 0.012 : 0.0018;
      const factor = Math.exp(-e.deltaY * intensity);
      animRef.current?.stop();
      setTransformState((t) => {
        const k = clamp(t.k * factor, MIN_K, MAX_K);
        const ratio = k / t.k;
        return { k, x: px - (px - t.x) * ratio, y: py - (py - t.y) * ratio };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // 双指捏合（触屏）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    const rectOf = () => el.getBoundingClientRect();
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const rect = rectOf();
        setTransformState((t) => {
          pinchRef.current = {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            k: t.k,
            mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
            origin: t,
          };
          return t;
        });
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = pinchRef.current;
      if (pointers.size === 2 && p) {
        const [a, b] = Array.from(pointers.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const rect = rectOf();
        const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        const k = clamp((p.k * dist) / Math.max(1, p.dist), MIN_K, MAX_K);
        const ratio = k / p.origin.k;
        setTransformState({
          k,
          x: mid.x - (p.mid.x - p.origin.x) * ratio,
          y: mid.y - (p.mid.y - p.origin.y) * ratio,
        });
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchRef.current = null;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // 用标量进度插值（framer-motion 的对象动画在 onUpdate 里拿不到稳定的字段）
  const animateTo = useCallback((target: Transform, duration = 0.55) => {
    animRef.current?.stop();
    setTransformState((from) => {
      const t = { ...target, k: clamp(target.k, MIN_K, MAX_K) };
      animRef.current = animate(0, 1, {
        duration,
        ease: [0.2, 0.8, 0.2, 1],
        onUpdate: (p) =>
          setTransformState({
            x: from.x + (t.x - from.x) * p,
            y: from.y + (t.y - from.y) * p,
            k: from.k + (t.k - from.k) * p,
          }),
      });
      return from;
    });
  }, []);

  const fitToBounds = useCallback(
    (b: Bounds, padding = 40, animated = false, inset?: Inset) => {
      const el = containerRef.current;
      const w = el?.clientWidth ?? size.w;
      const h = el?.clientHeight ?? size.h;
      if (!w || !h) return;
      const l = inset?.left ?? 0;
      const r = inset?.right ?? 0;
      const tp = inset?.top ?? 0;
      const bt = inset?.bottom ?? 0;
      const t = fitTransform(b, Math.max(50, w - l - r), Math.max(50, h - tp - bt), padding);
      t.x += l;
      t.y += tp;
      if (animated) animateTo(t);
      else setTransform(t);
    },
    [animateTo, setTransform, size.h, size.w],
  );

  const zoomBy = useCallback(
    (factor: number, center?: { x: number; y: number }) => {
      const el = containerRef.current;
      const cx = center?.x ?? (el?.clientWidth ?? 0) / 2;
      const cy = center?.y ?? (el?.clientHeight ?? 0) / 2;
      setTransformState((t) => {
        const k = clamp(t.k * factor, MIN_K, MAX_K);
        const ratio = k / t.k;
        const target = { k, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
        animRef.current?.stop();
        animRef.current = animate(0, 1, {
          duration: 0.25,
          ease: "easeOut",
          onUpdate: (p) =>
            setTransformState({
              x: t.x + (target.x - t.x) * p,
              y: t.y + (target.y - t.y) * p,
              k: t.k + (target.k - t.k) * p,
            }),
        });
        return t;
      });
    },
    [],
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const px = clientX - (rect?.left ?? 0);
      const py = clientY - (rect?.top ?? 0);
      return { x: (px - transform.x) / transform.k, y: (py - transform.y) / transform.k };
    },
    [transform],
  );

  const beginPan = useCallback(
    (clientX: number, clientY: number) => {
      animRef.current?.stop();
      const origin = { ...transform };
      return {
        move: (cx: number, cy: number) => setTransformState({ ...origin, x: origin.x + (cx - clientX), y: origin.y + (cy - clientY) }),
        end: () => {},
      };
    },
    [transform],
  );

  return { transform, containerRef, setTransform, animateTo, fitToBounds, zoomBy, screenToWorld, beginPan, size };
}
