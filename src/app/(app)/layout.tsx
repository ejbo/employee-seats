import { requireUser } from "@/lib/auth/guards";
import { groupOffices, listOfficesWithStats } from "@/lib/offices/queries";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 登录墙：未登录的访客带着当前路径去登录页。
  const actor = await requireUser();
  const offices = await listOfficesWithStats();
  return (
    <AppShell user={actor} groups={groupOffices(offices)}>
      {children}
    </AppShell>
  );
}
