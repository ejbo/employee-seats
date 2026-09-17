import type { Actor } from "@/lib/auth/guards";
import type { OfficeGroup } from "@/lib/offices/queries";
import { isAdmin } from "@/lib/permissions";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar({ user, groups }: { user: Actor; groups: OfficeGroup[] }) {
  return (
    <aside className="thin-scrollbar hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface md:flex">
      <SidebarNav groups={groups} admin={isAdmin(user.role)} />
    </aside>
  );
}
