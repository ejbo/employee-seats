"use client";

import { useStore } from "zustand";
import {
  Armchair,
  CircleHelp,
  DoorOpen,
  Square,
  Grid3x3,
  Image as ImageIcon,
  LayoutGrid,
  MousePointer2,
  PenLine,
  Redo2,
  Sofa,
  SquareDashed,
  Type,
  Undo2,
} from "lucide-react";
import { redo, undo, useEditorStore, type Tool } from "@/stores/editor-store";
import { cn } from "@/lib/cn";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const TOOLS: { key: Tool; label: string; hint: string; icon: typeof MousePointer2 }[] = [
  { key: "select", label: "选择", hint: "V", icon: MousePointer2 },
  { key: "seat", label: "工位", hint: "S", icon: Armchair },
  { key: "room", label: "房间", hint: "R", icon: Square },
  { key: "zone", label: "部门区域", hint: "Z", icon: SquareDashed },
  { key: "wall", label: "墙体", hint: "W", icon: PenLine },
  { key: "door", label: "门", hint: "D", icon: DoorOpen },
  { key: "label", label: "文字", hint: "T", icon: Type },
  { key: "furniture", label: "物件", hint: "F", icon: Sofa },
  { key: "image", label: "底图", hint: "B", icon: ImageIcon },
];

export function ToolPalette({
  libraryOpen,
  onToggleLibrary,
  showGrid,
  onToggleGrid,
  onArray,
  onHelp,
}: {
  libraryOpen: boolean;
  onToggleLibrary: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onArray: () => void;
  onHelp: () => void;
}) {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const canUndo = useStore(useEditorStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useEditorStore.temporal, (s) => s.futureStates.length > 0);

  return (
    <TooltipProvider delayDuration={300}>
      <div data-ui className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-border bg-surface/95 p-1 shadow-pop backdrop-blur">
        {TOOLS.map(({ key, label, hint, icon: Icon }) => (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (key === "furniture") onToggleLibrary();
                  else setTool(key);
                }}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition",
                  (key === "furniture" ? libraryOpen : tool === key) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-label={label}
              >
                <Icon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {label} <kbd className="ml-1 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">{hint}</kbd>
            </TooltipContent>
          </Tooltip>
        ))}

        <div className="my-0.5 h-px bg-border" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onArray} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="批量生成工位">
              <LayoutGrid className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">批量生成工位阵列</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onHelp} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="快捷键速查">
              <CircleHelp className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">快捷键速查 <kbd className="ml-1 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">?</kbd></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleGrid}
              className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-muted", showGrid ? "text-foreground" : "text-subtle")}
              aria-label="网格"
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            网格显示 <kbd className="ml-1 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">G</kbd>
          </TooltipContent>
        </Tooltip>
        <div className="my-0.5 h-px bg-border" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={undo} disabled={!canUndo} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label="撤销">
              <Undo2 className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">撤销 ⌘Z</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={redo} disabled={!canRedo} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label="重做">
              <Redo2 className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">重做 ⇧⌘Z</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
