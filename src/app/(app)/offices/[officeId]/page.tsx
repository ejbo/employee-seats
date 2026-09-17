import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Layers, MapPin } from "lucide-react";
import { requireUser, loadOfficeCapabilities } from "@/lib/auth/guards";
import { getOfficeSummary } from "@/lib/offices/queries";
import { OccupancyBar, StatPill } from "@/components/offices/occupancy";
import { OfficeActions } from "@/components/offices/office-actions";
import { OfficePermissions } from "@/components/offices/office-permissions";

export default async function OfficePage({ params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
  const actor = await requireUser(`/offices/${officeId}`);
  const office = await getOfficeSummary(officeId);
  if (!office) notFound();
  const caps = await loadOfficeCapabilities(actor, officeId);
  const free = office.total - office.occupied - office.disabled - office.reserved;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="text-xs text-muted-foreground">
        {office.institute} · {office.city}
      </div>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{office.name}</h1>
          {office.address && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {office.address}
            </p>
          )}
          {office.description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{office.description}</p>}
        </div>
        <OfficeActions office={office} caps={caps} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill label="总座位" value={office.total} />
        <StatPill label="已用" value={office.occupied} tone="info" />
        <StatPill label="空闲" value={Math.max(0, free)} tone="success" />
        <StatPill label="预留 / 停用" value={`${office.reserved} / ${office.disabled}`} tone="muted" />
      </div>

      <h2 className="mt-10 text-sm font-semibold tracking-wide text-muted-foreground">楼层</h2>
      {office.floors.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-muted-foreground">
          还没有楼层。{caps.canEditLayout ? "点击「新建楼层」添加第一层。" : ""}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {office.floors.map((f) => (
            <Link
              key={f.id}
              href={`/offices/${office.id}/floors/${f.id}`}
              className="group flex flex-col rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-base font-semibold">
                  <Layers className="h-4 w-4 text-subtle" />
                  {f.name}
                </div>
                <ArrowRight className="h-4 w-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <div className="mt-4">
                <span className="font-mono text-2xl font-semibold tabular-nums">{f.occupied}</span>
                <span className="ml-1 text-xs text-muted-foreground">/ {f.total} 座</span>
              </div>
              <OccupancyBar total={f.total} occupied={f.occupied} disabled={f.disabled} className="mt-3" />
            </Link>
          ))}
        </div>
      )}
      {caps.canGrantEditor && <OfficePermissions officeId={officeId} caps={caps} />}
    </div>
  );
}
