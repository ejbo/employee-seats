import Link from "next/link";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/permissions";
import { groupOffices, listOfficesWithStats } from "@/lib/offices/queries";
import { OccupancyBar, StatPill } from "@/components/offices/occupancy";
import { OfficeFormDialog } from "@/components/offices/office-form-dialog";

export default async function HomePage() {
  const actor = await requireUser("/");
  const offices = await listOfficesWithStats();
  const groups = groupOffices(offices);
  const total = offices.reduce((a, o) => a + o.total, 0);
  const occupied = offices.reduce((a, o) => a + o.occupied, 0);
  const disabled = offices.reduce((a, o) => a + o.disabled, 0);
  const reserved = offices.reduce((a, o) => a + o.reserved, 0);
  const free = total - occupied - disabled - reserved;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">总览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {offices.length} 个办公室 · {offices.reduce((a, o) => a + o.floors.length, 0)} 个楼层
          </p>
        </div>
        {isAdmin(actor.role) && <OfficeFormDialog mode="create" />}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill label="总座位" value={total} />
        <StatPill label="已用" value={occupied} tone="info" />
        <StatPill label="空闲" value={Math.max(0, free)} tone="success" />
        <StatPill label="预留 / 停用" value={`${reserved} / ${disabled}`} tone="muted" />
      </div>

      {groups.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-border-strong p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-sm font-medium">还没有办公室</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin(actor.role) ? "点击右上角「新建办公室」开始。" : "请联系管理员创建办公室。"}
          </p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.institute} className="mt-10">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">{g.institute}</h2>
          {g.cities.map((c) => (
            <div key={c.city} className="mt-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-subtle">
                <MapPin className="h-3 w-3" />
                {c.city}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {c.offices.map((o) => (
                  <Link
                    key={o.id}
                    href={`/offices/${o.id}`}
                    className="group flex flex-col rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold tracking-tight">{o.name}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{o.address || "未填写地址"}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                    <div className="mt-4 flex items-baseline gap-4">
                      <div>
                        <span className="font-mono text-2xl font-semibold tabular-nums">{o.occupied}</span>
                        <span className="ml-1 text-xs text-muted-foreground">/ {o.total} 座</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{o.floors.length} 层</div>
                    </div>
                    <OccupancyBar total={o.total} occupied={o.occupied} disabled={o.disabled} className="mt-3" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
