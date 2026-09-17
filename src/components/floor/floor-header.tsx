"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, ChevronRight, Eye, Grid2x2, Layers, Pencil, UserRoundCheck } from "lucide-react";
import type { OfficeCapabilities } from "@/lib/permissions";
import type { FloorMode, FloorView } from "@/hooks/use-floor-url-state";
import { cn } from "@/lib/cn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FloorHeader({
  office,
  floors,
  floorId,
  floorName,
  view,
  mode,
  caps,
  onViewChange,
  onModeChange,
  right,
}: {
  office: { id: string; name: string; institute: string; city: string };
  floors: { id: string; name: string }[];
  floorId: string;
  floorName: string;
  view: FloorView;
  mode: FloorMode;
  caps: OfficeCapabilities;
  onViewChange: (v: FloorView) => void;
  onModeChange: (m: FloorMode) => void;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const modes: { key: FloorMode; label: string; icon: typeof Eye; show: boolean }[] = [
    { key: "view", label: "查看", icon: Eye, show: true },
    { key: "assign", label: "分配", icon: UserRoundCheck, show: caps.canAssign },
    { key: "edit", label: "编辑", icon: Pencil, show: caps.canEditLayout },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2">
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <Link href={`/offices/${office.id}`} className="truncate text-muted-foreground hover:text-foreground">
          {office.name}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <Select value={floorId} onValueChange={(id) => router.push(`/offices/${office.id}/floors/${id}${view === "3d" ? "?view=3d" : ""}`)}>
          <SelectTrigger className="h-8 w-auto min-w-24 gap-1 border-transparent bg-transparent px-2 font-semibold shadow-none hover:bg-muted">
            <Layers className="h-3.5 w-3.5 text-subtle" />
            <SelectValue placeholder={floorName} />
          </SelectTrigger>
          <SelectContent>
            {floors.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1" />

      <Segmented
        value={view}
        onChange={onViewChange}
        options={[
          { key: "2d", label: "2D", icon: Grid2x2 },
          { key: "3d", label: "3D", icon: Box },
        ]}
      />
      {modes.filter((m) => m.show).length > 1 && (
        <Segmented
          value={mode}
          onChange={onModeChange}
          options={modes.filter((m) => m.show).map((m) => ({ key: m.key, label: m.label, icon: m.icon }))}
        />
      )}
      {right}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string; icon?: typeof Eye }[];
}) {
  return (
    <div className="flex items-center rounded-lg border border-border bg-muted p-0.5">
      {options.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition",
            value === key ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </button>
      ))}
    </div>
  );
}
