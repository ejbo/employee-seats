"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Building2, ChevronRight, LayoutDashboard, Layers, ShieldCheck, Users } from "lucide-react";
import type { OfficeGroup } from "@/lib/offices/queries";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "总览", icon: LayoutDashboard },
  { href: "/employees", label: "员工", icon: Users },
];

export function SidebarNav({ groups, admin }: { groups: OfficeGroup[]; admin: boolean }) {
  const pathname = usePathname();
  const items = admin ? [...NAV, { href: "/admin", label: "管理", icon: ShieldCheck }] : NAV;
  return (
    <nav className="flex flex-col gap-4 p-3">
      <div className="flex flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>

      <div>
        <div className="flex items-center gap-2 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
          <Building2 className="h-3.5 w-3.5" />
          办公室
        </div>
        {groups.length === 0 && <p className="px-3 py-2 text-xs text-subtle">尚未创建办公室。</p>}
        {groups.map((g) => (
          <div key={g.institute} className="mb-2">
            <div className="px-3 py-1 text-xs font-medium text-muted-foreground">{g.institute}</div>
            {g.cities.map((c) => (
              <div key={c.city}>
                {g.cities.length > 1 && <div className="px-3 pt-1 text-[11px] text-subtle">{c.city}</div>}
                {c.offices.map((o) => (
                  <OfficeItem key={o.id} office={o} pathname={pathname} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

function OfficeItem({
  office,
  pathname,
}: {
  office: OfficeGroup["cities"][number]["offices"][number];
  pathname: string;
}) {
  const base = `/offices/${office.id}`;
  const active = pathname === base || pathname.startsWith(`${base}/`);
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? active;
  return (
    <div>
      <div
        className={cn(
          "group flex items-center rounded-lg pr-1 text-sm transition",
          active && pathname === base ? "bg-muted font-medium" : "hover:bg-muted",
        )}
      >
        <button
          type="button"
          aria-label={expanded ? "收起楼层" : "展开楼层"}
          onClick={() => setOpen(!expanded)}
          className="flex h-8 w-6 items-center justify-center text-subtle hover:text-foreground"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        <Link href={base} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2">
          <span className="truncate">{office.name}</span>
          <span className="ml-auto shrink-0 font-mono text-[11px] text-subtle">
            {office.occupied}/{office.total}
          </span>
        </Link>
      </div>
      {expanded && office.floors.length > 0 && (
        <div className="ml-6 border-l border-border pl-2">
          {office.floors.map((f) => {
            const href = `${base}/floors/${f.id}`;
            const fActive = pathname.startsWith(href);
            return (
              <Link
                key={f.id}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition",
                  fActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Layers className="h-3 w-3" />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto font-mono text-[10px] text-subtle">
                  {f.occupied}/{f.total}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
