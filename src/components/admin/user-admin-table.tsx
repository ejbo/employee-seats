"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { api, ApiClientError, fetcher } from "@/lib/api-client";
import { errorMessage, OFFICE_ROLE_LABELS, ROLE_LABELS } from "@/lib/labels";
import type { GlobalRole, OfficeRole } from "@/lib/permissions";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface UserRow {
  id: string;
  huaweiW3Id: string;
  displayName: string;
  role: GlobalRole;
  isActive: boolean;
  lastLoginAt: string | null;
  employee: { name: string; department: { name: string } | null } | null;
  grants: { role: OfficeRole; office: { id: string; name: string } }[];
}

export function UserAdminTable({ canChangeRole, selfId }: { canChangeRole: boolean; selfId: string }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, mutate, isLoading } = useSWR<{ items: UserRow[]; total: number }>(`/api/admin/users?q=${encodeURIComponent(debounced)}`, fetcher, { keepPreviousData: true });
  const [pending, setPending] = useState<string | null>(null);

  async function setRole(u: UserRow, role: GlobalRole) {
    setPending(u.id);
    try {
      await api(`/api/admin/users/${u.id}/role`, { method: "PUT", json: { role } });
      toast.success(`${u.displayName} 已设为${ROLE_LABELS[role]}`);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "修改失败") : "修改失败");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索姓名 / 工号" className="pl-8" />
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>用户</TableHead>
              <TableHead>部门</TableHead>
              <TableHead>全局角色</TableHead>
              <TableHead>办公室授权</TableHead>
              <TableHead>最近登录</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.displayName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{u.huaweiW3Id}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.employee?.department?.name ?? "—"}</TableCell>
                <TableCell>
                  {canChangeRole && u.id !== selfId ? (
                    <Select value={u.role} onValueChange={(v) => void setRole(u, v as GlobalRole)} disabled={pending === u.id}>
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ROLE_LABELS) as GlobalRole[]).map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${u.role === "USER" ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground"}`}>{ROLE_LABELS[u.role]}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {u.grants.length === 0 ? (
                    <span className="text-subtle">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.grants.map((g) => (
                        <Link key={g.office.id} href={`/offices/${g.office.id}`} className="rounded-full border border-border px-2 py-0.5 hover:bg-muted">
                          {g.office.name} · {OFFICE_ROLE_LABELS[g.role]}
                        </Link>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("zh-CN", { hour12: false }) : "尚未登录"}</TableCell>
              </TableRow>
            ))}
            {isLoading && !data && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  没有匹配的用户
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">共 {data?.total ?? 0} 个账号</p>
    </div>
  );
}
