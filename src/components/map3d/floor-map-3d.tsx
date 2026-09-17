"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { FloorScene } from "@/lib/map/types";

const Scene3D = dynamic(() => import("./scene").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-map-canvas text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      载入 3D 视图…
    </div>
  ),
});

export function FloorMap3D({ scene, onSeatClick }: { scene: FloorScene; onSeatClick?: (seatId: string) => void }) {
  return <Scene3D scene={scene} onSeatClick={onSeatClick} />;
}
