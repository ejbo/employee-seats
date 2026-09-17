"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import type { OfficeSummary } from "@/lib/offices/queries";
import { api, ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OfficeFormDialog } from "@/components/offices/office-form-dialog";

export function OfficeAdminTable({ offices }: { offices: OfficeSummary[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<OfficeSummary | null>(null);
  const [pending, setPending] = useState(false);

  async function remove() {
    if (!target) return;
    setPending(true);
    try {
      await api(`/api/offices/${target.id}`, { method: "DELETE" });
      toast.success("已删除办公室");
      setTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "删除失败") : "删除失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>研究所</TableHead>
            <TableHead>城市</TableHead>
            <TableHead>办公室</TableHead>
            <TableHead>地址</TableHead>
            <TableHead className="text-right">楼层</TableHead>
            <TableHead className="text-right">座位（已用/总数）</TableHead>
            <TableHead className="w-28 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {offices.map((o) => (
            <TableRow key={o.id}>
              <TableCell>{o.institute}</TableCell>
              <TableCell>{o.city}</TableCell>
              <TableCell>
                <Link href={`/offices/${o.id}`} className="font-medium hover:underline">
                  {o.name}
                </Link>
              </TableCell>
              <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{o.address || "—"}</TableCell>
              <TableCell className="text-right font-mono text-sm">{o.floors.length}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {o.occupied}/{o.total}
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex items-center gap-1">
                  <OfficeFormDialog
                    mode="edit"
                    office={o}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label="编辑">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                  <Button variant="ghost" size="icon-sm" aria-label="删除" className="text-danger hover:text-danger" onClick={() => setTarget(o)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {offices.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                还没有办公室
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? `删除办公室「${target.name}」？` : ""}
        description="将同时删除其所有楼层、区域和座位。仍有员工落座时无法删除。此操作不可撤销。"
        confirmLabel="删除"
        destructive
        pending={pending}
        onConfirm={remove}
      />
    </div>
  );
}
