"use client";

/** 吸附参考线：品红细线 + 等间距 / 净距徽标。画在地图坐标系里，线宽按缩放保持 1px。 */
import type { Guide } from "@/lib/map/snap";

export function SnapGuides({ guides, k }: { guides: Guide[]; k: number }) {
  if (!guides.length) return null;
  const pad = 40 / k;
  return (
    <g style={{ pointerEvents: "none" }}>
      {guides.map((g, i) => {
        const x1 = g.axis === "x" ? g.value : g.from - pad;
        const x2 = g.axis === "x" ? g.value : g.to + pad;
        const y1 = g.axis === "y" ? g.value : g.from - pad;
        const y2 = g.axis === "y" ? g.value : g.to + pad;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const label = g.kind === "gap" && g.gap !== undefined ? `= ${Math.round(g.gap)} cm` : g.kind === "wall" ? "墙" : null;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--guide)" strokeWidth={1 / k} strokeDasharray={g.kind === "center" ? `${4 / k} ${4 / k}` : undefined} />
            {label && (
              <g transform={`translate(${g.axis === "x" ? g.value + 6 / k : mx} ${g.axis === "y" ? g.value - 6 / k : my})`}>
                <rect x={-2 / k} y={-11 / k} width={(label.length * 6.5 + 8) / k} height={14 / k} rx={3 / k} fill="var(--guide)" />
                <text x={2 / k} y={0} fontSize={10 / k} fill="#fff" fontFamily="var(--font-mono)">
                  {label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
