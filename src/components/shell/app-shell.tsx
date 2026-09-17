import type { Actor } from "@/lib/auth/guards";
import type { OfficeGroup } from "@/lib/offices/queries";
import { TopBar } from "./top-bar";
import { Sidebar } from "./sidebar";

export function AppShell({
  user,
  groups,
  children,
}: {
  user: Actor;
  groups: OfficeGroup[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <TopBar user={user} groups={groups} />
      <div className="flex min-h-0 flex-1">
        <Sidebar user={user} groups={groups} />
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
