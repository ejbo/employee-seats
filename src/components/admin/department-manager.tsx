"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { api, ApiClientError, fetcher } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { DEPARTMENT_PALETTE } from "@/lib/map/colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Dept {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  employeeCount: number;
  zoneCount: number;
}

export function DepartmentManager() {
  const { data, mutate, isLoading } = useSWR<{ departments: Dept[] }>("/api/departments", fetcher);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<Dept | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api("/api/departments", { method: "POST", json: { name: newName.trim() } });
      setNewName("");
      toast.success("已新建部门");
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "创建失败") : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/departments/${id}`, { method: "PATCH", json: body });
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "保存失败") : "保存失败");
    }
  }

  async function remove() {
    if (!target) return;
    setDeleting(true);
    try {
      await api(`/api/departments/${target.id}`, { method: "DELETE" });
      toast.success("已删除部门");
      setTarget(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "删除失败") : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={create} className="flex items-center gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新部门名称" className="max-w-xs" />
        <Button type="submit" disabled={creating || !newName.trim()}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          新建
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {isLoading && !data && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          </div>
        )}
        {data?.departments.map((d) => (
          <DepartmentRow key={d.id} dept={d} onPatch={(body) => patch(d.id, body)} onDelete={() => setTarget(d)} />
        ))}
        {data?.departments.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">还没有部门</div>}
      </div>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? `删除部门「${target.name}」？` : ""}
        description={
          target
            ? `${target.employeeCount} 名在职员工将变为无部门，${target.zoneCount} 个区域将失去部门关联。`
            : undefined
        }
        confirmLabel="删除"
        destructive
        pending={deleting}
        onConfirm={remove}
      />
    </div>
  );
}

function DepartmentRow({
  dept,
  onPatch,
  onDelete,
}: {
  dept: Dept;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(dept.name);
  const dirty = name.trim() !== dept.name && name.trim().length > 0;
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
      <ColorPicker value={dept.color} onChange={(c) => void onPatch({ color: c })} />
      <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
      {dirty && (
        <Button variant="outline" size="sm" onClick={() => void onPatch({ name: name.trim() })}>
          <Check className="h-3.5 w-3.5" />
          保存
        </Button>
      )}
      <span className="ml-auto text-xs text-muted-foreground">
        {dept.employeeCount} 人 · {dept.zoneCount} 个区域
      </span>
      <Button variant="ghost" size="icon-sm" className="text-danger hover:text-danger" aria-label="删除" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="选择颜色"
        onClick={() => setOpen((o) => !o)}
        className="h-7 w-7 rounded-full border border-border-strong shadow-sm"
        style={{ background: value }}
      />
      {open && (
        <div className="absolute left-0 top-9 z-20 grid w-44 grid-cols-6 gap-1.5 rounded-xl border border-border bg-surface p-2 shadow-pop">
          {DEPARTMENT_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full"
              style={{ background: c }}
            >
              {c.toLowerCase() === value.toLowerCase() && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
          ))}
          <label className="col-span-6 mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            自定义
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-10 cursor-pointer rounded border border-border bg-transparent"
            />
          </label>
        </div>
      )}
    </div>
  );
}
