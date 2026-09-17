"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Building2, MapPin, Search, User } from "lucide-react";
import { fetcher } from "@/lib/api-client";
import type { SearchOffice, SearchPerson, SearchSeat } from "@/lib/search";
import { cn } from "@/lib/cn";

type Results = { people: SearchPerson[]; seats: SearchSeat[]; offices: SearchOffice[] };
type Item = { key: string; href: string; primary: string; secondary: string; icon: typeof User; color?: string };

function toItems(r: Results | undefined): Item[] {
  if (!r) return [];
  const items: Item[] = [];
  for (const p of r.people) {
    items.push({
      key: `p-${p.id}`,
      href: p.seat ? `/offices/${p.seat.officeId}/floors/${p.seat.floorId}?seat=${encodeURIComponent(p.seat.code)}` : `/employees?q=${encodeURIComponent(p.employeeNo)}`,
      primary: p.name,
      secondary: `${p.employeeNo}${p.department ? ` · ${p.department.name}` : ""}${p.seat ? ` · ${p.seat.officeName} ${p.seat.floorName} ${p.seat.code}` : " · 未落座"}`,
      icon: User,
      color: p.department?.color,
    });
  }
  for (const s of r.seats) {
    items.push({
      key: `s-${s.id}`,
      href: `/offices/${s.officeId}/floors/${s.floorId}?seat=${encodeURIComponent(s.code)}`,
      primary: `座位 ${s.code}`,
      secondary: `${s.officeName} ${s.floorName}${s.occupant ? ` · ${s.occupant}` : " · 空闲"}`,
      icon: MapPin,
    });
  }
  for (const o of r.offices) {
    items.push({ key: `o-${o.id}`, href: `/offices/${o.id}`, primary: o.name, secondary: `${o.institute} · ${o.city}`, icon: Building2 });
  }
  return items;
}

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useSWR<Results>(debounced ? `/api/search?q=${encodeURIComponent(debounced)}` : null, fetcher, {
    keepPreviousData: true,
  });
  const items = toItems(debounced ? data : undefined);

  // 点击外部关闭；⌘K / "/" 聚焦
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function go(item: Item) {
    setOpen(false);
    setQ("");
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      const it = items[active];
      if (it) go(it);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showPanel = open && debounced.length > 0;

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="搜索姓名、工号、座位号…"
        className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-12 text-sm outline-none transition placeholder:text-subtle focus:border-border-strong focus:ring-2 focus:ring-(--ring)"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
        ⌘K
      </kbd>
      {showPanel && (
        <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-border bg-surface shadow-pop">
          {items.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">{isLoading ? "搜索中…" : "没有匹配结果"}</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {items.map((it, i) => (
                <li key={it.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(it)}
                    className={cn("flex w-full items-center gap-3 px-3 py-2 text-left", i === active ? "bg-muted" : "")}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted" style={it.color ? { background: it.color, color: "#fff" } : undefined}>
                      <it.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{it.primary}</span>
                      <span className="block truncate text-xs text-muted-foreground">{it.secondary}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
