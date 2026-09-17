"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, CloudOff, Loader2 } from "lucide-react";
import type { FurnitureType } from "@/lib/map/types";
import { useEditorStore } from "@/stores/editor-store";
import { useAutosave } from "@/hooks/use-autosave";
import type { FloorPagePayload } from "@/components/floor/floor-workspace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EditorCanvas } from "./editor-canvas";
import { ToolPalette } from "./tool-palette";
import { PropertiesPanel } from "./properties-panel";
import { SeatArrayDialog } from "./seat-array-dialog";

export function FloorEditor({
  payload,
  onSaved,
  svgRef,
}: {
  payload: FloorPagePayload;
  onSaved: (p: FloorPagePayload) => void;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}) {
  const floorId = payload.scene.floor.id;
  const hydratedFloorId = useEditorStore((s) => s.floorId);
  const [furnitureType, setFurnitureType] = useState<FurnitureType>("meeting");
  const [showGrid, setShowGrid] = useState(true);
  const [arrayOpen, setArrayOpen] = useState(false);

  // 进入编辑器：把当前场景灌进 store（切换楼层时重新灌）
  useEffect(() => {
    if (useEditorStore.getState().floorId !== floorId) useEditorStore.getState().hydrate(payload.scene);
  }, [floorId, payload.scene]);

  const { saveNow, conflict, reload, force } = useAutosave({ floorId, enabled: hydratedFloorId === floorId, onSaved });

  // 离开编辑器时若有未保存改动，尽力保存一次
  useEffect(() => {
    return () => {
      if (useEditorStore.getState().saveStatus === "dirty") saveNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hydratedFloorId !== floorId) {
    return (
      <div className="flex h-full items-center justify-center bg-map-canvas text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        载入编辑器…
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <EditorCanvas
        employees={payload.scene.employees}
        departments={payload.scene.departments}
        furnitureType={furnitureType}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((g) => !g)}
        onSaveNow={saveNow}
        svgRef={svgRef}
      />
      <ToolPalette
        furnitureType={furnitureType}
        onFurnitureType={setFurnitureType}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((g) => !g)}
        onArray={() => setArrayOpen(true)}
      />
      <PropertiesPanel departments={payload.scene.departments} floorId={floorId} />
      <SaveStatusPill onSaveNow={saveNow} />
      <SeatArrayDialog open={arrayOpen} onOpenChange={setArrayOpen} />

      <Dialog open={conflict !== null}>
        <DialogContent hideClose className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              他人已修改这一层
            </DialogTitle>
            <DialogDescription>
              你的改动基于旧版本。可以放弃本地改动加载最新布局，或以本地为准覆盖服务器版本（会丢掉对方的改动）。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => void force()}>
              强制覆盖
            </Button>
            <Button onClick={() => void reload()}>重新加载</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaveStatusPill({ onSaveNow }: { onSaveNow: () => void }) {
  const status = useEditorStore((s) => s.saveStatus);
  const map = {
    saved: { icon: Check, text: "已保存", cls: "text-success" },
    dirty: { icon: Loader2, text: "有未保存的改动", cls: "text-muted-foreground" },
    saving: { icon: Loader2, text: "保存中…", cls: "text-info" },
    conflict: { icon: AlertTriangle, text: "版本冲突", cls: "text-warning" },
    error: { icon: CloudOff, text: "保存失败，点击重试", cls: "text-danger" },
  } as const;
  const m = map[status];
  const Icon = m.icon;
  return (
    <button
      type="button"
      data-ui
      onClick={onSaveNow}
      className={`absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-surface/95 px-3 py-1 text-xs shadow-lift backdrop-blur ${m.cls}`}
      title="⌘S 立即保存"
    >
      <Icon className={`h-3.5 w-3.5 ${status === "saving" ? "animate-spin" : ""}`} />
      {m.text}
    </button>
  );
}
