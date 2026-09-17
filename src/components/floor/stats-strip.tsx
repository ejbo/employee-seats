"use client";

import { useMemo } from "react";
import type { FloorScene } from "@/lib/map/types";
import { seatState } from "@/lib/map/types";
import { useViewStore } from "@/stores/view-store";
import { cn } from "@/lib/cn";

/** 楼层统计 + 部门图例（点击部门高亮）。 */
export function StatsStrip({ scene }: { scene: FloorScene }) {
  const highlightDeptId = useViewStore((s) => s.highlightDeptId);
  const toggle = useViewStore((s) => s.toggleHighlightDept);

  const stats = useMemo(() => {
    const counts = { total: scene.seats.length, occupied: 0, free: 0, reserved: 0, disabled: 0 };
    const byDept = new Map<string, number>();
    let noDept = 0;
    for (const s of scene.seats) {
      const st = seatState(s);
      counts[st] += 1;
      if (st === "occupied" && s.employeeId) {
        const emp = scene.employees[s.employeeId];
        if (emp?.departmentId) byDept.set(emp.departmentId, (byDept.get(emp.departmentId) ?? 0) + 1);
        else noDept += 1;
      }
    }
    const depts = Array.from(byDept.entries())
      .map(([id, n]) => ({ id, n, dept: scene.departments[id] }))
      .filter((d) => d.dept)
      .sort((a, b) => b.n - a.n);
    return { counts, depts, noDept };
  }, [scene]);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-surface px-4 py-2 text-xs">
      <div className="flex items-center gap-3 font-mono tabular-nums">
        <span>
          <span className="text-muted-foreground">总</span> {stats.counts.total}
        </span>
        <span className="text-info">
          <span className="text-muted-foreground">已用</span> {stats.counts.occupied}
        </span>
        <span className="text-success">
          <span className="text-muted-foreground">空闲</span> {stats.counts.free}
        </span>
        {stats.counts.reserved > 0 && (
          <span>
            <span className="text-muted-foreground">预留</span> {stats.counts.reserved}
          </span>
        )}
        {stats.counts.disabled > 0 && (
          <span>
            <span className="text-muted-foreground">停用</span> {stats.counts.disabled}
          </span>
        )}
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex flex-wrap items-center gap-1.5">
        {stats.depts.map(({ id, n, dept }) => {
          const active = highlightDeptId === id;
          const muted = highlightDeptId && !active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition",
                active ? "border-border-strong bg-muted font-medium" : "border-transparent hover:bg-muted",
                muted && "opacity-45",
              )}
              title={`只看 ${dept!.name}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: dept!.color }} />
              {dept!.name}
              <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
            </button>
          );
        })}
        {stats.noDept > 0 && <span className="px-1 text-[11px] text-subtle">无部门 {stats.noDept}</span>}
        {highlightDeptId && (
          <button type="button" onClick={() => toggle(null)} className="px-1.5 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
            清除筛选
          </button>
        )}
      </div>
    </div>
  );
}
