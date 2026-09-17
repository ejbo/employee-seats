import Link from "next/link";
import { MapPinned } from "lucide-react";
import type { Actor } from "@/lib/auth/guards";
import type { OfficeGroup } from "@/lib/offices/queries";
import { isAdmin } from "@/lib/permissions";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { GlobalSearch } from "./global-search";

export function TopBar({ user, groups }: { user: Actor; groups: OfficeGroup[] }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:gap-4 sm:px-4">
      <MobileNav groups={groups} admin={isAdmin(user.role)} />
      <Link href="/" className="flex shrink-0 items-center gap-2.5 text-sm font-semibold tracking-tight">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <MapPinned className="h-4 w-4" />
        </span>
        <span className="hidden sm:inline">座位图</span>
      </Link>
      <div className="flex flex-1 justify-center px-2">
        <GlobalSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
