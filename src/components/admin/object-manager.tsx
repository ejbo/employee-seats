"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api, fetcher } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { CATEGORY_LABELS, type ObjectCategory } from "@/lib/map/catalog";
import type { ObjectSpec } from "@/lib/map/object-spec";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TopDownPreview } from "@/components/editor/object-from-photo-dialog";

interface Row {
  id: string;
  key: string;
  name: string;
  category: string;
  w: number;
  d: number;
  h: number;
  spec: ObjectSpec;
  isActive: boolean;
  createdAt: string;
}

export function ObjectManager() {
  const { data, mutate, isLoading } = useSWR<{ objects: Row[] }>("/api/objects?all=1", fetcher);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/objects/${id}`, { method: "PATCH", json: body });
      await mutate();
    } catch (e) {
      toast.error(errorMessage((e as { code?: string }).code));
    }
  }

  if (isLoading) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 载入中…
      </div>
    );
  }
  const rows = data?.objects ?? [];
  return (
    <div className="mt-6 space-y-2">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">还没有自定义物件。在楼层编辑器的物件库里点「从照片生成」即可创建。</p>}
      {rows.map((r) => (
        <div key={r.id} className={`flex items-center gap-4 rounded-xl border border-border p-3 ${r.isActive ? "" : "opacity-60"}`}>
          <TopDownPreview spec={r.spec} size={56} />
          <div className="min-w-0 flex-1">
            {editing === r.id ? (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await patch(r.id, { name: name.trim() });
                  setEditing(null);
                }}
              >
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-xs text-sm" autoFocus />
                <Button size="sm" type="submit">
                  保存
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}>
                  取消
                </Button>
              </form>
            ) : (
              <button
                type="button"
                className="truncate text-left text-sm font-medium hover:underline"
                onClick={() => {
                  setEditing(r.id);
                  setName(r.name);
                }}
              >
                {r.name}
              </button>
            )}
            <div className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[r.category as ObjectCategory] ?? r.category} · {r.w}×{r.d}×{r.h} cm · {r.spec.parts.length} 个部件 · {new Date(r.createdAt).toLocaleDateString("zh-CN")}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={r.isActive} onCheckedChange={(v) => void patch(r.id, { isActive: v })} />
            {r.isActive ? "启用" : "已停用"}
          </label>
        </div>
      ))}
    </div>
  );
}
