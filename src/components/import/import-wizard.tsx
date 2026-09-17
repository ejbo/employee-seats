"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, Upload, XCircle } from "lucide-react";
import { api, ApiClientError, fetcher } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { withBasePath } from "@/lib/base-path";
import type { ImportDiff, ImportMode, RowChange } from "@/lib/import/diff";
import type { ParsedSeatRow } from "@/lib/import/parse";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";

type OfficeOpt = { id: string; name: string; city: string; institute: string };
type PreviewResponse = { officeId: string; mode: ImportMode; rows: ParsedSeatRow[]; matched: string[]; unknownHeaders: string[]; diff: ImportDiff };
type ApplyResponse = { batchId: string; summary: ImportDiff["summary"] };

const EMP_LABEL: Record<RowChange["employee"], string> = { create: "新建", update: "更新", reactivate: "复职", deactivate: "离职", unchanged: "—", none: "—" };
const SEAT_LABEL: Record<RowChange["seat"], string> = { assign: "落座", move: "移动", unassign: "释放", unchanged: "不变", none: "—" };

export function ImportWizard({
  defaultOfficeId,
  trigger,
  onDone,
}: {
  defaultOfficeId?: string;
  trigger?: React.ReactNode;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [officeId, setOfficeId] = useState(defaultOfficeId ?? "");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ApplyResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: officesData } = useSWR<{ offices: OfficeOpt[] }>(open ? "/api/offices" : null, fetcher);
  const offices = officesData?.offices ?? [];
  // 只有一个办公室时默认选中它（派生，不用 effect）
  const effectiveOfficeId = officeId || (offices.length === 1 ? offices[0].id : "");

  function reset() {
    setStep(1);
    setFile(null);
    setText("");
    setPreview(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function doPreview() {
    if (!effectiveOfficeId) {
      toast.error("请先选择办公室");
      return;
    }
    if (!file && !text.trim()) {
      toast.error("请选择文件或粘贴表格内容");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("officeId", effectiveOfficeId);
      fd.append("mode", mode);
      if (file) fd.append("file", file);
      else fd.append("text", text);
      const res = await api<PreviewResponse>("/api/imports/parse", { method: "POST", body: fd });
      setPreview(res);
      setStep(2);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "no_rows") {
        const unknown = (err.body?.unknownHeaders as string[] | undefined) ?? [];
        toast.error(`${errorMessage(err.code)}${unknown.length ? `；未识别的表头：${unknown.join("、")}` : ""}`);
      } else toast.error(err instanceof ApiClientError ? errorMessage(err.code, "解析失败") : "解析失败");
    } finally {
      setBusy(false);
    }
  }

  async function doApply() {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await api<ApplyResponse>("/api/imports/apply", {
        method: "POST",
        json: { officeId: preview.officeId, mode: preview.mode, rows: preview.rows, expectedHash: preview.diff.hash },
      });
      setResult(res);
      setStep(3);
      onDone?.();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "preview_stale") {
        toast.error(errorMessage(err.code));
        setStep(1);
      } else toast.error(err instanceof ApiClientError ? errorMessage(err.code, "导入失败") : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  const diff = preview?.diff;
  const blocked = Boolean(diff?.errors.length);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Upload className="h-4 w-4" />
            导入 Excel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>导入座位表</DialogTitle>
          <DialogDescription>
            {step === 1 && "选择办公室与文件。导入前会先预览所有变更，确认后才写入。"}
            {step === 2 && "请核对变更内容；有错误时需要修正文件后重新预览。"}
            {step === 3 && "导入完成。"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>办公室</Label>
                <Select value={effectiveOfficeId} onValueChange={setOfficeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择办公室" />
                  </SelectTrigger>
                  <SelectContent>
                    {offices.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.institute} · {o.city} · {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>模式</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as ImportMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merge">合并：只改表里出现的人和座位</SelectItem>
                    <SelectItem value="replace">全量替换：不在表内的占用者将被释放</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>文件（.xlsx / .csv）</Label>
                {effectiveOfficeId && (
                  <a href={withBasePath(`/api/imports/template?officeId=${effectiveOfficeId}`)} className="inline-flex items-center gap-1 text-xs text-info hover:underline">
                    <Download className="h-3.5 w-3.5" />
                    下载本办公室模板（含座位清单）
                  </a>
                )}
              </div>
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-sm transition hover:bg-muted",
                  file ? "border-info/50 bg-info/5" : "border-border-strong",
                )}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <FileUp className="h-5 w-5 text-subtle" />
                {file ? (
                  <span>
                    {file.name} <span className="text-xs text-muted-foreground">（{Math.round(file.size / 1024)} KB）</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">点击选择文件</span>
                )}
                <span className="text-[11px] text-subtle">列：座位编号 | 工号 | 姓名 | 部门 | 备注 | 楼层 …（顺序不限，支持中英文表头）</span>
              </label>
            </div>

            <div className="space-y-1.5">
              <Label>或直接粘贴表格（含表头，从 Excel 复制即可）</Label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={"座位编号\t工号\t姓名\t部门\nA01\t00123456\t张三\t研发一部"} className="font-mono text-xs" disabled={Boolean(file)} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button onClick={doPreview} disabled={busy}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                预览变更
              </Button>
            </div>
          </div>
        )}

        {step === 2 && diff && preview && (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip label="行" value={diff.summary.rows} />
              <Chip label="新建" value={diff.summary.created} tone="success" />
              <Chip label="更新" value={diff.summary.updated} />
              <Chip label="复职" value={diff.summary.reactivated} />
              <Chip label="离职" value={diff.summary.deactivated} tone="warning" />
              <Chip label="落座" value={diff.summary.assigned} tone="success" />
              <Chip label="移动" value={diff.summary.moved} />
              <Chip label="释放" value={diff.summary.unassigned} tone="warning" />
              <Chip label="不变" value={diff.summary.unchanged} />
              {preview.unknownHeaders.length > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">忽略的列：{preview.unknownHeaders.join("、")}</span>}
            </div>

            {diff.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-danger">
                  <XCircle className="h-3.5 w-3.5" />
                  {diff.errors.length} 个错误，需修正后重新预览
                </div>
                <ul className="space-y-0.5">
                  {diff.errors.map((e, i) => (
                    <li key={i}>
                      <span className="font-mono text-muted-foreground">第 {e.rowNo} 行</span> {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {diff.warnings.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {diff.warnings.length} 条提醒
                </div>
                <ul className="space-y-0.5">
                  {diff.warnings.map((w, i) => (
                    <li key={i}>
                      {w.rowNo > 0 && <span className="font-mono text-muted-foreground">第 {w.rowNo} 行 </span>}
                      {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="max-h-72 overflow-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-14">行</TableHead>
                    <TableHead>工号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>员工</TableHead>
                    <TableHead>座位</TableHead>
                    <TableHead>说明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diff.changes.map((c) => (
                    <TableRow key={c.rowNo} className={c.employee === "unchanged" && (c.seat === "unchanged" || c.seat === "none") ? "opacity-50" : ""}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.rowNo}</TableCell>
                      <TableCell className="font-mono text-xs">{c.employeeNo}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>
                        <Tag kind={c.employee === "create" || c.employee === "reactivate" ? "success" : c.employee === "deactivate" ? "warning" : c.employee === "update" ? "info" : "muted"}>{EMP_LABEL[c.employee]}</Tag>
                      </TableCell>
                      <TableCell>
                        <Tag kind={c.seat === "assign" || c.seat === "move" ? "success" : c.seat === "unassign" ? "warning" : "muted"}>
                          {SEAT_LABEL[c.seat]}
                          {c.seatCode && c.seat !== "none" ? ` ${c.seatCode}` : ""}
                        </Tag>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.fields.length > 0 && <span>改：{c.fields.join("、")} </span>}
                        {c.from && <span>从 {c.from.floorName} {c.from.code} </span>}
                        {c.displaced && <span className="text-warning">挤出 {c.displaced.name}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {diff.unassigns.map((u) => (
                    <TableRow key={`u-${u.seatId}-${u.employeeId}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground">—</TableCell>
                      <TableCell className="font-mono text-xs">{u.employeeNo}</TableCell>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>
                        <Tag kind="muted">—</Tag>
                      </TableCell>
                      <TableCell>
                        <Tag kind="warning">释放 {u.code}</Tag>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.reason === "not_in_sheet" ? "不在表内（全量替换）" : u.reason === "blank_seat" ? "表内座位留空" : u.reason === "deactivated" ? "离职" : u.reason === "displaced" ? "座位被他人占用" : "清空座位"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                返回
              </Button>
              <Button onClick={doApply} disabled={busy || blocked}>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                确认导入
              </Button>
            </div>
          </div>
        )}

        {step === 3 && result && (
          <div className="grid gap-4">
            <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
              <CheckCircle2 className="h-6 w-6 text-success" />
              <div className="text-sm">
                <div className="font-medium">导入完成</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  新建 {result.summary.created} · 更新 {result.summary.updated} · 复职 {result.summary.reactivated} · 离职 {result.summary.deactivated} · 落座 {result.summary.assigned} · 移动 {result.summary.moved} · 释放 {result.summary.unassigned}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>完成</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" }) {
  return (
    <span className={cn("rounded-full border border-border px-2 py-0.5", value > 0 && tone === "success" && "border-success/40 text-success", value > 0 && tone === "warning" && "border-warning/40 text-warning")}>
      {label} <span className="font-mono">{value}</span>
    </span>
  );
}

function Tag({ kind, children }: { kind: "success" | "warning" | "info" | "muted"; children: React.ReactNode }) {
  const cls = kind === "success" ? "bg-success/10 text-success" : kind === "warning" ? "bg-warning/10 text-warning" : kind === "info" ? "bg-info/10 text-info" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>{children}</span>;
}
