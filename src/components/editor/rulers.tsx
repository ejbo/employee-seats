"use client";

/**
 * 画布标尺：上、左两条独立 svg（data-ui，不参与导出、不接收指针），刻度按缩放自动选 0.1 / 0.5 / 1 / 2 / 5 m，
 * 光标线直接改 DOM，不触发 React 重渲染。
 */
import { useEffect, useRef } from "react";
import type { Transform } from "@/lib/map/geometry";

export const RULER_SIZE = 20;
const STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

function pickStep(k: number): { major: number; minor: number } {
  const major = STEPS.find((s) => s * k >= 64) ?? STEPS[STEPS.length - 1];
  const minor = major / (major === 20 || major === 200 || major === 2000 ? 4 : 5);
  return { major, minor: minor * k >= 6 ? minor : 0 };
}

function fmt(cm: number): string {
  const m = cm / 100;
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}

export function Rulers({ transform, size, containerRef }: { transform: Transform; size: { w: number; h: number }; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const hRef = useRef<SVGLineElement>(null);
  const vRef = useRef<SVGLineElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      hRef.current?.setAttribute("x1", String(x));
      hRef.current?.setAttribute("x2", String(x));
      vRef.current?.setAttribute("y1", String(y));
      vRef.current?.setAttribute("y2", String(y));
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, [containerRef]);

  const { k, x: tx, y: ty } = transform;
  const { major, minor } = pickStep(k);
  const ticksFor = (offset: number, length: number) => {
    const out: { pos: number; v: number; major: boolean }[] = [];
    if (!length || !k) return out;
    const step = minor || major;
    const from = Math.floor(-offset / k / step) * step;
    const to = Math.ceil((length - offset) / k / step) * step;
    for (let v = from; v <= to; v += step) {
      out.push({ pos: offset + v * k, v, major: Math.abs(v / major - Math.round(v / major)) < 1e-6 });
    }
    return out;
  };
  const hTicks = ticksFor(tx, size.w);
  const vTicks = ticksFor(ty, size.h);

  return (
    <>
      <svg data-ui className="pointer-events-none absolute left-0 top-0 bg-surface/90 text-[9px] backdrop-blur" width={size.w} height={RULER_SIZE} style={{ fontFamily: "var(--font-mono)" }}>
        <line x1={0} y1={RULER_SIZE - 0.5} x2={size.w} y2={RULER_SIZE - 0.5} stroke="var(--border)" />
        {hTicks.map((t) => (
          <g key={t.v}>
            <line x1={t.pos} y1={t.major ? RULER_SIZE - 9 : RULER_SIZE - 4} x2={t.pos} y2={RULER_SIZE} stroke="var(--border-strong)" />
            {t.major && (
              <text x={t.pos + 3} y={9} fill="var(--muted-foreground)">
                {fmt(t.v)}
              </text>
            )}
          </g>
        ))}
        <line ref={hRef} x1={-10} y1={0} x2={-10} y2={RULER_SIZE} stroke="var(--info)" strokeWidth={1} />
        <rect x={0} y={0} width={RULER_SIZE} height={RULER_SIZE} fill="var(--surface)" />
        <text x={4} y={13} fill="var(--muted-foreground)">
          m
        </text>
      </svg>
      <svg data-ui className="pointer-events-none absolute left-0 top-0 bg-surface/90 text-[9px] backdrop-blur" width={RULER_SIZE} height={size.h} style={{ fontFamily: "var(--font-mono)" }}>
        <line x1={RULER_SIZE - 0.5} y1={RULER_SIZE} x2={RULER_SIZE - 0.5} y2={size.h} stroke="var(--border)" />
        {vTicks.map((t) =>
          t.pos < RULER_SIZE ? null : (
            <g key={t.v}>
              <line x1={t.major ? RULER_SIZE - 9 : RULER_SIZE - 4} y1={t.pos} x2={RULER_SIZE} y2={t.pos} stroke="var(--border-strong)" />
              {t.major && (
                <text x={-t.pos - 3} y={9} fill="var(--muted-foreground)" transform="rotate(-90)" textAnchor="end">
                  {fmt(t.v)}
                </text>
              )}
            </g>
          ),
        )}
        <line ref={vRef} x1={0} y1={-10} x2={RULER_SIZE} y2={-10} stroke="var(--info)" strokeWidth={1} />
      </svg>
    </>
  );
}
