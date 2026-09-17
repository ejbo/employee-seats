"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface OfficeFormValues {
  institute: string;
  city: string;
  name: string;
  address: string;
  description: string;
}

const EMPTY: OfficeFormValues = { institute: "", city: "", name: "", address: "", description: "" };

export function OfficeFormDialog({
  mode,
  office,
  trigger,
}: {
  mode: "create" | "edit";
  office?: { id: string } & OfficeFormValues;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<OfficeFormValues>(office ?? EMPTY);
  const [pending, setPending] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) setValues(office ?? EMPTY);
    setOpen(next);
  }

  const set = (k: keyof OfficeFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      if (mode === "create") {
        const { office: created } = await api<{ office: { id: string } }>("/api/offices", { method: "POST", json: values });
        toast.success("已创建办公室");
        setOpen(false);
        router.push(`/offices/${created.id}`);
      } else if (office) {
        await api(`/api/offices/${office.id}`, { method: "PATCH", json: values });
        toast.success("已保存");
        setOpen(false);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? errorMessage(err.code, "保存失败") : "保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4" />
            新建办公室
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "新建办公室" : "编辑办公室"}</DialogTitle>
          <DialogDescription>研究所、城市和名称用于在侧栏分组展示；地址会显示在办公室页面。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="office-institute">研究所</Label>
              <Input id="office-institute" value={values.institute} onChange={set("institute")} placeholder="如 中央研究院" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="office-city">城市</Label>
              <Input id="office-city" value={values.city} onChange={set("city")} placeholder="如 深圳" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="office-name">办公室名称</Label>
            <Input id="office-name" value={values.name} onChange={set("name")} placeholder="如 坂田基地 J 区" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="office-address">地址</Label>
            <Input id="office-address" value={values.address} onChange={set("address")} placeholder="详细地址（可选）" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="office-description">备注</Label>
            <Textarea id="office-description" value={values.description} onChange={set("description")} rows={2} placeholder="可选" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === "create" ? "创建" : "保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
