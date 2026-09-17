"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { DepartmentSummary, EmployeeSummary } from "@/lib/map/types";
import { accountMatchKey } from "@/lib/employee-key";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/** 未落座员工的搜索列表（分配到某个座位）。 */
export function EmployeePicker({
  employees,
  departments,
  onPick,
  pendingId,
  compact = false,
  draggable,
}: {
  employees: EmployeeSummary[];
  departments: Record<string, DepartmentSummary>;
  onPick?: (employeeId: string) => void;
  pendingId?: string | null;
  compact?: boolean;
  /** 传入则每行可拖拽 */
  draggable?: (e: React.PointerEvent, emp: EmployeeSummary) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/\s+/g, "");
    if (!term) return employees;
    const key = accountMatchKey(term);
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(term) ||
        e.employeeNo.toLowerCase().includes(term) ||
        (key && accountMatchKey(e.employeeNo)?.includes(key)) ||
        (e.departmentId && departments[e.departmentId]?.name.includes(q.trim())),
    );
  }, [employees, departments, q]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索未落座员工…" className="h-8 pl-8 text-xs" />
      </div>
      <div className={cn("thin-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto", compact ? "max-h-56" : "")}>
        {list.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">{employees.length === 0 ? "所有在职员工都已落座" : "没有匹配的员工"}</p>}
        {list.map((e) => {
          const dept = e.departmentId ? departments[e.departmentId] : null;
          const pending = pendingId === e.id;
          return (
            <div
              key={e.id}
              onPointerDown={draggable ? (ev) => draggable(ev, e) : undefined}
              onClick={onPick ? () => onPick(e.id) : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition",
                onPick && "cursor-pointer hover:bg-muted",
                draggable && "cursor-grab active:cursor-grabbing",
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: dept?.color ?? "#8a8a93" }}>
                {e.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{e.name}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {e.employeeNo}
                  {dept ? ` · ${dept.name}` : ""}
                  {e.team ? ` · ${e.team}` : ""}
                </span>
              </span>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
