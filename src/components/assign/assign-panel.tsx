"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, UserPlus } from "lucide-react";
import type { DepartmentSummary, EmployeeSummary } from "@/lib/map/types";
import { beginDragCandidate } from "@/stores/drag-store";
import { Button } from "@/components/ui/button";
import { EmployeeFormDialog } from "@/components/employees/employee-form-dialog";
import { EmployeePicker } from "./employee-picker";

/** 分配模式左侧面板：未落座员工，可拖到座位上。 */
export function AssignPanel({
  employees,
  departments,
  onCreated,
}: {
  employees: EmployeeSummary[];
  departments: Record<string, DepartmentSummary>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(true);
  const deptList = Object.values(departments).map((d) => ({ id: d.id, name: d.name }));

  if (!open) {
    return (
      <button
        type="button"
        data-ui
        onClick={() => setOpen(true)}
        className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-border bg-surface/95 px-3 py-2 text-xs font-medium shadow-lift backdrop-blur"
      >
        <ChevronRight className="h-3.5 w-3.5" />
        未落座 {employees.length}
      </button>
    );
  }

  return (
    <aside data-ui className="absolute inset-y-3 left-3 z-10 flex w-72 flex-col rounded-2xl border border-border bg-surface/95 shadow-pop backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <GripVertical className="h-4 w-4 text-subtle" />
          未落座
          <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">{employees.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <EmployeeFormDialog
            mode="create"
            departments={deptList}
            onSaved={onCreated}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="新建员工" title="新建员工">
                <UserPlus className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <Button variant="ghost" size="icon-sm" aria-label="收起" onClick={() => setOpen(false)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="px-3 pt-2 text-[11px] leading-relaxed text-muted-foreground">把员工拖到座位上即可落座；拖动已落座的人可以移动或交换。</p>
      <div className="min-h-0 flex-1 px-2 pb-2 pt-2">
        <EmployeePicker
          employees={employees}
          departments={departments}
          draggable={(ev, emp) => {
            ev.preventDefault();
            beginDragCandidate(ev, {
              kind: "employee",
              employeeId: emp.id,
              fromSeatId: null,
              label: emp.name,
              sub: emp.employeeNo,
              color: emp.departmentId ? departments[emp.departmentId]?.color : undefined,
            });
          }}
        />
      </div>
    </aside>
  );
}
