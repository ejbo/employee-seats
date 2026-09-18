"use client";

/**
 * 尺寸标注：选中元素的每条边外侧画尺寸线 + 数值（米）。矩形类元素在自身旋转坐标系里画，房间按每条边画。
 */
import type { MapElement } from "@/lib/map/types";
import { rectTransform } from "@/lib/map/geometry";
import { roomEdges } from "@/lib/map/rectilinear";
import { rectOf } from "@/lib/map/transform";

function fmtM(cm: number): string {
  return `${(cm / 100).toFixed(2)} m`;
}

/** 一条尺寸线：从 a 到 b，向法线方向 (nx, ny) 偏移 off。 */
function DimLine({ a, b, nx, ny, off, k, text }: { a: [number, number]; b: [number, number]; nx: number; ny: number; off: number; k: number; text: string }) {
  const ax = a[0] + nx * off;
  const ay = a[1] + ny * off;
  const bx = b[0] + nx * off;
  const by = b[1] + ny * off;
  const tick = 5 / k;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  // 文字统一按「从左读到右 / 从下读到上」的制图习惯摆放
  let angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  angle = ((angle % 180) + 180) % 180;
  if (angle >= 90) angle -= 180;
  // 文字放在尺寸线再往外一点
  const tx = mx + nx * (9 / k);
  const ty = my + ny * (9 / k);
  return (
    <g stroke="var(--guide)" strokeWidth={1 / k} fill="none">
      <line x1={ax} y1={ay} x2={bx} y2={by} />
      <line x1={ax - nx * tick} y1={ay - ny * tick} x2={ax + nx * tick} y2={ay + ny * tick} />
      <line x1={bx - nx * tick} y1={by - ny * tick} x2={bx + nx * tick} y2={by + ny * tick} />
      <line x1={a[0]} y1={a[1]} x2={ax} y2={ay} strokeOpacity={0.35} />
      <line x1={b[0]} y1={b[1]} x2={bx} y2={by} strokeOpacity={0.35} />
      <text x={tx} y={ty} transform={`rotate(${angle} ${tx} ${ty})`} textAnchor="middle" dominantBaseline="central" fontSize={11 / k} fill="var(--guide)" stroke="none" fontFamily="var(--font-mono)">
        {text}
      </text>
    </g>
  );
}

export function DimensionOverlay({ el, k }: { el: MapElement; k: number }) {
  const off = 22 / k;
  if (el.kind === "room") {
    return (
      <g style={{ pointerEvents: "none" }}>
        {roomEdges(el.points)
          .filter((e) => e.length * k >= 28)
          .map((e) => (
            <DimLine key={e.index} a={e.a} b={e.b} nx={-e.inward[0]} ny={-e.inward[1]} off={off} k={k} text={fmtM(e.length)} />
          ))}
      </g>
    );
  }
  const r = rectOf(el);
  if (!r) return null;
  return (
    <g style={{ pointerEvents: "none" }} transform={rectTransform(r.x, r.y, r.w, r.h, r.rotation)}>
      <DimLine a={[0, 0]} b={[r.w, 0]} nx={0} ny={-1} off={off} k={k} text={fmtM(r.w)} />
      <DimLine a={[r.w, 0]} b={[r.w, r.h]} nx={1} ny={0} off={off} k={k} text={fmtM(r.h)} />
    </g>
  );
}
