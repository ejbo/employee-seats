"use client";

import { useState } from "react";
import { Download, FileImage, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FloorScene } from "@/lib/map/types";
import { downloadBlob, serializeMapSvg, svgToBlob, svgToPngBlob } from "@/lib/map/export";
import { withBasePath } from "@/lib/base-path";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ExportMenu({
  scene,
  officeName,
  svgRef,
}: {
  scene: FloorScene;
  officeName: string;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const [busy, setBusy] = useState(false);
  const base = `${officeName}-${scene.floor.name}`.replace(/[\\/:*?"<>|]+/g, "_");
  const bounds = { x: 0, y: 0, w: scene.floor.width, h: scene.floor.height };

  async function run(kind: "svg" | "png") {
    const svg = svgRef.current;
    if (!svg) {
      toast.error("请先切换到 2D 视图再导出图片");
      return;
    }
    setBusy(true);
    try {
      const text = serializeMapSvg(svg, bounds);
      if (kind === "svg") downloadBlob(svgToBlob(text), `${base}.svg`);
      else downloadBlob(await svgToPngBlob(text, Math.min(4000, Math.max(1600, scene.floor.width))), `${base}.png`);
      toast.success("已导出");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          导出
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>平面图</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void run("png")}>
          <FileImage className="mr-2 h-4 w-4" />
          PNG 图片（打印）
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run("svg")}>
          <FileImage className="mr-2 h-4 w-4" />
          SVG 矢量图
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>座位表</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={withBasePath(`/api/exports/seats.xlsx?floorId=${scene.floor.id}`)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel（本楼层）
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={withBasePath(`/api/exports/seats.xlsx?officeId=${scene.floor.officeId}`)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel（整个办公室）
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
