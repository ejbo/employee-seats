"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { fetcher } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AuditRow {
  id: string;
  action: string;
  summary: string;
  actorName: string;
  actorW3Id: string;
  officeName: string | null;
  floorName: string | null;
  batchId: string | null;
  createdAt: string;
}

const ACTION_GROUPS: { value: string; label: string }[] = [
  { value: "all", label: "全部操作" },
  { value: "seat.", label: "座位分配" },
  { value: "layout.", label: "布局保存" },
  { value: "import.", label: "导入" },
  { value: "employee.", label: "员工" },
  { value: "permission.", label: "授权" },
  { value: "user.", label: "角色" },
  { value: "office.", label: "办公室" },
  { value: "floor.", label: "楼层" },
];

const ACTION_LABEL: Record<string, string> = {
  "seat.assign": "落座",
  "seat.release": "释放",
  "seat.move": "移动",
  "seat.swap": "交换",
  "layout.save": "布局",
  "import.apply": "导入",
  "employee.create": "新建员工",
  "employee.update": "修改员工",
  "employee.deactivate": "离职",
  "employee.reactivate": "复职",
  "permission.grant": "授权",
  "permission.revoke": "撤销授权",
  "user.role": "角色",
  "office.create": "新建办公室",
  "office.update": "修改办公室",
  "office.delete": "删除办公室",
  "floor.create": "新建楼层",
  "floor.update": "修改楼层",
  "floor.delete": "删除楼层",
  "department.create": "新建部门",
  "department.update": "修改部门",
  "department.delete": "删除部门",
};

const PAGE_SIZE = 50;

export function AuditTable({ offices, officeId: fixedOffice }: { offices: { id: string; name: string }[]; officeId?: string }) {
  const [officeId, setOfficeId] = useState(fixedOffice ?? "all");
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams();
  if (officeId !== "all") params.set("officeId", officeId);
  if (action !== "all") params.set("action", action);
  if (debounced) params.set("q", debounced);
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));
  const { data, isLoading } = useSWR<{ items: AuditRow[]; total: number }>(`/api/audit?${params.toString()}`, fetcher, { keepPreviousData: true });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="搜索内容 / 操作人"
            className="pl-8"
          />
        </div>
        {!fixedOffice && (
          <Select
            value={officeId}
            onValueChange={(v) => {
              setOfficeId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部办公室</SelectItem>
              {offices.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={action}
          onValueChange={(v) => {
            setAction(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_GROUPS.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-40">时间</TableHead>
              <TableHead className="w-24">操作</TableHead>
              <TableHead>内容</TableHead>
              <TableHead className="w-36">位置</TableHead>
              <TableHead className="w-32">操作人</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                <TableCell>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{ACTION_LABEL[r.action] ?? r.action}</span>
                </TableCell>
                <TableCell className="text-sm">{r.summary}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{[r.officeName, r.floorName].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-xs">
                  {r.actorName} <span className="font-mono text-muted-foreground">{r.actorW3Id}</span>
                </TableCell>
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
                  没有记录
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>共 {data?.total ?? 0} 条</span>
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
    </div>
  );
}
