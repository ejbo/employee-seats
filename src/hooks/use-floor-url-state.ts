"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type FloorView = "2d" | "3d";
export type FloorMode = "view" | "assign" | "edit";

/** 楼层页的 URL 状态：?view=2d|3d&mode=view|assign|edit&seat=CODE */
export function useFloorUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const view: FloorView = sp.get("view") === "3d" ? "3d" : "2d";
  const modeRaw = sp.get("mode");
  const mode: FloorMode = modeRaw === "assign" || modeRaw === "edit" ? modeRaw : "view";
  const seat = sp.get("seat");

  const update = useCallback(
    (patch: Partial<{ view: FloorView; mode: FloorMode; seat: string | null }>) => {
      const next = new URLSearchParams(sp.toString());
      if (patch.view !== undefined) {
        if (patch.view === "2d") next.delete("view");
        else next.set("view", patch.view);
      }
      if (patch.mode !== undefined) {
        if (patch.mode === "view") next.delete("mode");
        else next.set("mode", patch.mode);
      }
      if (patch.seat !== undefined) {
        if (patch.seat) next.set("seat", patch.seat);
        else next.delete("seat");
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, sp],
  );

  return { view, mode, seat, update };
}
