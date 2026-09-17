import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { isSuperAdmin } from "@/lib/permissions";
import { UserAdminTable } from "@/components/admin/user-admin-table";

export const metadata: Metadata = { title: "用户与权限" };

export default async function AdminUsersPage() {
  const actor = await requireRole("ADMIN", "/admin/users");
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">用户与权限</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        登录过（或被提前授权）的账号。办公室级授权在各办公室页面维护；这里可以{isSuperAdmin(actor.role) ? "任免管理员" : "查看角色"}。
      </p>
      <UserAdminTable canChangeRole={isSuperAdmin(actor.role)} selfId={actor.id} />
    </div>
  );
}
