"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import type { OfficeSummary } from "@/lib/offices/queries";
import type { OfficeCapabilities } from "@/lib/permissions";
import { api, ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { OfficeFormDialog } from "./office-form-dialog";
import { FloorFormDialog } from "./floor-form-dialog";
import { ImportWizard } from "@/components/import/import-wizard";

export function OfficeActions({ office, caps }: { office: OfficeSummary; caps: OfficeCapabilities }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!caps.canEditLayout && !caps.canManageOffice) return null;

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/offices/${office.id}`, { method: "DELETE" });
      toast.success("已删除办公室");
      setConfirmOpen(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "删除失败") : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {caps.canEditLayout && <FloorFormDialog mode="create" officeId={office.id} />}
      {caps.canEditLayout && <ImportWizard defaultOfficeId={office.id} onDone={() => router.refresh()} />}
      {caps.canManageOffice && (
        <OfficeFormDialog
          mode="edit"
          office={office}
          trigger={
            <Button variant="outline">
              <Pencil className="h-4 w-4" />
              编辑
            </Button>
          }
        />
      )}
      {caps.canManageOffice && (
        <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="h-4 w-4" />
          删除
        </Button>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`删除办公室「${office.name}」？`}
        description="将同时删除其所有楼层、区域和座位。仍有员工落座时无法删除。此操作不可撤销。"
        confirmLabel="删除"
        destructive
        pending={deleting}
        onConfirm={remove}
      />
    </div>
  );
}
