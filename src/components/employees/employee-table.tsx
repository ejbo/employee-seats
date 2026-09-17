"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Search, UserMinus, UserPlus } from "lucide-react";
import { api, ApiClientError, fetcher } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import type { EmployeeListItem } from "@/lib/employees/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmployeeFormDialog } from "./employee-form-dialog";

type Dept = { id: string; name: string; color: string };
type ListResponse = { items: EmployeeListItem[]; total: number; page: number; pageSize: number };

const PAGE_SIZE = 50;

export function EmployeeTable({ canEdit, departments }: { canEdit: boolean; departments: Dept[] }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [active, setActive] = useState<"1" | "0" | "all">("1");
  const [unassigned, setUnassigned] = useState(false);
  const [page, setPage] = useState(1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<EmployeeListItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams();
  if (debouncedQ) params.set("q", debouncedQ);
  if (departmentId !== "all") params.set("departmentId", departmentId);
  params.set("active", active);
  if (unassigned) params.set("unassigned", "1");
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));
  const key = `/api/employees?${params.toString()}`;
  const { data, isLoading, mutate } = useSWR<ListResponse>(key, fetcher, { keepPreviousData: true });

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function toggleActive(emp: EmployeeListItem) {
    setPendingId(emp.id);
    try {
      await api(`/api/employees/${emp.id}/${emp.isActive ? "deactivate" : "reactivate"}`, { method: "POST" });
      toast.success(emp.isActive ? `${emp.name} 已离职，座位已释放` : `${emp.name} 已复职`);
      setConfirm(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "操作失败") : "操作失败");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="搜索姓名 / 工号 / 邮箱"
            className="pl-8"
          />
        </div>
        <Select
          value={departmentId}
          onValueChange={(v) => {
            setDepartmentId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="全部部门" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部部门</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: d.color }} />
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={active}
          onValueChange={(v) => {
            setActive(v as "1" | "0" | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">在职</SelectItem>
            <SelectItem value="0">已离职</SelectItem>
            <SelectItem value="all">全部</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="unassigned"
            checked={unassigned}
            onCheckedChange={(v) => {
              setUnassigned(v);
              setPage(1);
            }}
          />
          <Label htmlFor="unassigned" className="text-sm font-normal text-muted-foreground">
            只看未落座
          </Label>
        </div>
        <div className="flex-1" />
        {canEdit && <EmployeeFormDialog mode="create" departments={departments} onSaved={() => void mutate()} />}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>姓名</TableHead>
              <TableHead>工号</TableHead>
              <TableHead>部门</TableHead>
              <TableHead>团队 / 职位</TableHead>
              <TableHead>座位</TableHead>
              <TableHead className="w-24">状态</TableHead>
              {canEdit && <TableHead className="w-32 text-right">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((e) => (
              <TableRow key={e.id} className={!e.isActive ? "opacity-60" : undefined}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{e.employeeNo}</TableCell>
                <TableCell>
                  {e.department ? (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className="h-2 w-2 rounded-full" style={{ background: e.department.color }} />
                      {e.department.name}
                    </span>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {[e.team, e.title].filter(Boolean).join(" · ") || <span className="text-subtle">—</span>}
                </TableCell>
                <TableCell>
                  {e.seat ? (
                    <Link
                      href={`/offices/${e.seat.floor.office.id}/floors/${e.seat.floor.id}?seat=${encodeURIComponent(e.seat.code)}`}
                      className="text-sm hover:underline"
                    >
                      {e.seat.floor.office.name} · {e.seat.floor.name} ·{" "}
                      <span className="font-mono">{e.seat.code}</span>
                    </Link>
                  ) : (
                    <span className="text-sm text-subtle">未落座</span>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      e.isActive
                        ? "rounded-full bg-success/10 px-2 py-0.5 text-xs text-success"
                        : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    }
                  >
                    {e.isActive ? "在职" : "已离职"}
                  </span>
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <EmployeeFormDialog
                        mode="edit"
                        departments={departments}
                        employee={{
                          id: e.id,
                          employeeNo: e.employeeNo,
                          name: e.name,
                          departmentName: e.department?.name ?? "",
                          team: e.team,
                          title: e.title,
                          email: e.email,
                          phone: e.phone,
                          note: e.note,
                        }}
                        onSaved={() => void mutate()}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="编辑">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={e.isActive ? "离职" : "复职"}
                        title={e.isActive ? "离职并释放座位" : "复职"}
                        disabled={pendingId === e.id}
                        onClick={() => (e.isActive ? setConfirm(e) : void toggleActive(e))}
                      >
                        {pendingId === e.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : e.isActive ? (
                          <UserMinus className="h-3.5 w-3.5" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 7 : 6} className="py-10 text-center text-sm text-muted-foreground">
                  没有符合条件的员工
                </TableCell>
              </TableRow>
            )}
            {isLoading && !data && (
              <TableRow>
                <TableCell colSpan={canEdit ? 7 : 6} className="py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>共 {total} 人</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="上一页">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono">
            {page} / {pages}
          </span>
          <Button variant="ghost" size="icon-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="下一页">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? `标记 ${confirm.name} 离职？` : ""}
        description={confirm?.seat ? `将同时释放座位 ${confirm.seat.code}。可随时复职。` : "可随时复职。"}
        confirmLabel="确认离职"
        destructive
        pending={pendingId === confirm?.id}
        onConfirm={() => {
          if (confirm) void toggleActive(confirm);
        }}
      />
    </div>
  );
}
