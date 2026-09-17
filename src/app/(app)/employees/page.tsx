import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { canManageEmployees, requireUser } from "@/lib/auth/guards";
import { EmployeeTable } from "@/components/employees/employee-table";
import { ImportRefresher } from "@/components/import/import-refresher";

export const metadata: Metadata = { title: "员工" };

export default async function EmployeesPage() {
  const actor = await requireUser("/employees");
  const [canEdit, departments] = await Promise.all([
    canManageEmployees(actor),
    prisma.department.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true } }),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">员工</h1>
          <p className="mt-1 text-sm text-muted-foreground">花名册与座位归属。按姓名或工号搜索。</p>
        </div>
        {canEdit && <ImportRefresher />}
      </div>
      <EmployeeTable canEdit={canEdit} departments={departments} />
    </div>
  );
}
