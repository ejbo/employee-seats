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

export interface FloorFormValues {
  name: string;
  /** 米 */
  widthM: number;
  heightM: number;
  gridSize: number;
}

const DEFAULTS: FloorFormValues = { name: "", widthM: 40, heightM: 30, gridSize: 20 };

export function FloorFormDialog({
  mode,
  officeId,
  floor,
  trigger,
}: {
  mode: "create" | "edit";
  officeId: string;
  floor?: { id: string } & FloorFormValues;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FloorFormValues>(floor ?? DEFAULTS);
  const [pending, setPending] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) setValues(floor ?? DEFAULTS);
    setOpen(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const payload = {
      name: values.name,
      width: Math.round(values.widthM * 100),
      height: Math.round(values.heightM * 100),
      gridSize: Math.round(values.gridSize),
    };
    try {
      if (mode === "create") {
        const { floor: created } = await api<{ floor: { id: string } }>(`/api/offices/${officeId}/floors`, {
          method: "POST",
          json: payload,
        });
        toast.success("已创建楼层");
        setOpen(false);
        router.push(`/offices/${officeId}/floors/${created.id}`);
      } else if (floor) {
        await api(`/api/floors/${floor.id}`, { method: "PATCH", json: payload });
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

  const num = (k: "widthM" | "heightM" | "gridSize") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: Number(e.target.value) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={mode === "create" ? "default" : "outline"}>
            {mode === "create" && <Plus className="h-4 w-4" />}
            {mode === "create" ? "新建楼层" : "编辑楼层"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "新建楼层" : "编辑楼层"}</DialogTitle>
          <DialogDescription>画布尺寸按实际办公区域估算即可，之后可以在编辑器里调整。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="floor-name">楼层名称</Label>
            <Input id="floor-name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} placeholder="如 3F 或 A 栋 2 层" required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="floor-w">宽（米）</Label>
              <Input id="floor-w" type="number" min={5} max={500} step={1} value={values.widthM} onChange={num("widthM")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="floor-h">高（米）</Label>
              <Input id="floor-h" type="number" min={5} max={500} step={1} value={values.heightM} onChange={num("heightM")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="floor-grid">网格（厘米）</Label>
              <Input id="floor-grid" type="number" min={5} max={200} step={5} value={values.gridSize} onChange={num("gridSize")} required />
            </div>
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
