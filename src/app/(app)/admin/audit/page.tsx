import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { listOfficesWithStats } from "@/lib/offices/queries";
import { AuditTable } from "@/components/admin/audit-table";

export const metadata: Metadata = { title: "变更记录" };

export default async function AdminAuditPage() {
  await requireRole("ADMIN", "/admin/audit");
  const offices = await listOfficesWithStats();
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">变更记录</h1>
      <p className="mt-1 text-sm text-muted-foreground">座位分配、布局保存、导入、权限变更等操作的审计日志。</p>
      <AuditTable offices={offices.map((o) => ({ id: o.id, name: o.name }))} />
    </div>
  );
}
