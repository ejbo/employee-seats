"use client";

import type { DepartmentSummary, EmployeeSummary, SeatEl } from "@/lib/map/types";
import { seatState } from "@/lib/map/types";
import { SEAT_STATE_LABELS } from "@/lib/labels";

export function SeatTooltip({
  seat,
  employee,
  departments,
  left: rawLeft,
  top: rawTop,
  containerWidth,
}: {
  seat: SeatEl;
  employee: EmployeeSummary | null;
  departments: Record<string, DepartmentSummary>;
  /** 相对地图容器的像素坐标 */
  left: number;
  top: number;
  containerWidth: number;
}) {
  const left = rawLeft + 14;
  const top = rawTop + 14;
  const state = seatState(seat);
  const dept = employee?.departmentId ? departments[employee.departmentId] : null;
  const flipX = containerWidth > 0 && left + 220 > containerWidth;
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-40 max-w-60 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop"
      style={{ left: flipX ? left - 28 : left, top, transform: flipX ? "translateX(-100%)" : undefined }}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{seat.code}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{SEAT_STATE_LABELS[state]}</span>
      </div>
      {employee ? (
        <>
          <div className="mt-1 text-sm font-semibold">{employee.name}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{employee.employeeNo}</div>
          {(dept || employee.team || employee.title) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {dept && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: dept.color }} />
                  {dept.name}
                </span>
              )}
              {employee.team && <span>· {employee.team}</span>}
              {employee.title && <span>· {employee.title}</span>}
            </div>
          )}
        </>
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">{seat.note || "无人"}</div>
      )}
    </div>
  );
}
