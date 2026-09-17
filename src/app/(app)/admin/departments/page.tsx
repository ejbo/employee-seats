import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { DepartmentManager } from "@/components/admin/department-manager";

export const metadata: Metadata = { title: "部门与颜色" };

export default async function AdminDepartmentsPage() {
  await requireRole("ADMIN", "/admin/departments");
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">部门与颜色</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        颜色用于地图上的区域淡色与座位色条。导入花名册时遇到新部门会自动创建并分配颜色。
      </p>
      <DepartmentManager />
    </div>
  );
}
