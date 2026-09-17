"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { api, ApiClientError, fetcher } from "@/lib/api-client";
import { errorMessage, OFFICE_ROLE_LABELS, ROLE_LABELS } from "@/lib/labels";
import type { GlobalRole, OfficeCapabilities, OfficeRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Grant {
  userId: string;
  role: OfficeRole;
  createdAt: string;
  user: { id: string; huaweiW3Id: string; displayName: string; role: GlobalRole; lastLoginAt: string | null; employee: { name: string; department: { name: string } | null } | null };
  grantedBy: { displayName: string } | null;
}

/** 办公室页的「权限」区块：查看 / 授予 / 撤销本办公室的编辑与管理权限。 */
export function OfficePermissions({ officeId, caps }: { officeId: string; caps: OfficeCapabilities }) {
  const { data, mutate, isLoading } = useSWR<{ grants: Grant[] }>(`/api/offices/${officeId}/permissions`, fetcher);
  const [w3Id, setW3Id] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<OfficeRole>("EDITOR");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Grant | null>(null);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    if (!w3Id.trim()) return;
    setBusy(true);
    try {
      await api(`/api/offices/${officeId}/permissions`, { method: "PUT", json: { w3Id: w3Id.trim(), role, name: name.trim() || undefined } });
      toast.success("已授权");
      setW3Id("");
      setName("");
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "授权失败") : "授权失败");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/api/offices/${officeId}/permissions/${target.userId}`, { method: "DELETE" });
      toast.success("已撤销");
      setTarget(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "撤销失败") : "撤销失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        权限
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        座位编辑可分配 / 释放座位并维护员工；办公室管理员还可编辑布局、导入座位表、授予座位编辑。管理员（全局）自动拥有所有办公室的管理权限。
      </p>
      <form onSubmit={grant} className="mt-3 flex flex-wrap items-center gap-2">
        <Input value={w3Id} onChange={(e) => setW3Id(e.target.value)} placeholder="工号" className="w-36 font-mono" required />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名（未登录过时用于显示）" className="w-52" />
        <Select value={role} onValueChange={(v) => setRole(v as OfficeRole)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EDITOR">{OFFICE_ROLE_LABELS.EDITOR}</SelectItem>
            {caps.canManageOffice && <SelectItem value="MANAGER">{OFFICE_ROLE_LABELS.MANAGER}</SelectItem>}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={busy || !w3Id.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          授权
        </Button>
      </form>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
        {isLoading && !data && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          </div>
        )}
        {data?.grants.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">还没有授权任何人</div>}
        {data?.grants.map((g) => (
          <div key={g.userId} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">{g.user.displayName.slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{g.user.displayName}</span>
                <span className="font-mono text-xs text-muted-foreground">{g.user.huaweiW3Id}</span>
                {g.user.role !== "USER" && <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">{ROLE_LABELS[g.user.role]}</span>}
                {!g.user.lastLoginAt && <span className="text-[10px] text-subtle">尚未登录</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {g.user.employee?.department?.name ? `${g.user.employee.department.name} · ` : ""}
                {g.grantedBy ? `由 ${g.grantedBy.displayName} 授权` : ""}
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs ${g.role === "MANAGER" ? "bg-info/10 text-info" : "bg-muted text-muted-foreground"}`}>{OFFICE_ROLE_LABELS[g.role]}</span>
            {(g.role === "EDITOR" || caps.canManageOffice) && (
              <Button variant="ghost" size="icon-sm" aria-label="撤销" className="text-danger hover:text-danger" onClick={() => setTarget(g)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? `撤销 ${target.user.displayName} 的「${OFFICE_ROLE_LABELS[target.role]}」？` : ""}
        confirmLabel="撤销"
        destructive
        pending={busy}
        onConfirm={revoke}
      />
    </section>
  );
}
