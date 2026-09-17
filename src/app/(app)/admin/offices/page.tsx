import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { listOfficesWithStats } from "@/lib/offices/queries";
import { OfficeAdminTable } from "@/components/admin/office-admin-table";
import { OfficeFormDialog } from "@/components/offices/office-form-dialog";

export const metadata: Metadata = { title: "办公室管理" };

export default async function AdminOfficesPage() {
  await requireRole("ADMIN", "/admin/offices");
  const offices = await listOfficesWithStats();
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">办公室管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">共 {offices.length} 个办公室。</p>
        </div>
        <OfficeFormDialog mode="create" />
      </div>
      <OfficeAdminTable offices={offices} />
    </div>
  );
}
