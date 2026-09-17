import { cn } from "@/lib/cn";

export function occupancyPct(total: number, occupied: number): number {
  return total > 0 ? Math.round((occupied / total) * 100) : 0;
}

/** 占用率条：已用 / 可用总数（不含停用）。 */
export function OccupancyBar({
  total,
  occupied,
  disabled = 0,
  className,
}: {
  total: number;
  occupied: number;
  disabled?: number;
  className?: string;
}) {
  const usable = Math.max(0, total - disabled);
  const pct = occupancyPct(usable, occupied);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", pct >= 95 ? "bg-warning" : "bg-info")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function StatPill({ label, value, tone }: { label: string; value: number | string; tone?: "info" | "success" | "warning" | "muted" }) {
  const toneClass =
    tone === "info"
      ? "text-info"
      : tone === "success"
        ? "text-success"
        : tone === "warning"
          ? "text-warning"
          : "text-foreground";
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface px-4 py-3">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className={cn("mt-0.5 font-mono text-xl font-semibold tabular-nums", toneClass)}>{value}</span>
    </div>
  );
}
