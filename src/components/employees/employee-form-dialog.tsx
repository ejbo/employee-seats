"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface EmployeeFormValues {
  employeeNo: string;
  name: string;
  departmentName: string;
  team: string;
  title: string;
  email: string;
  phone: string;
  note: string;
}

const EMPTY: EmployeeFormValues = { employeeNo: "", name: "", departmentName: "", team: "", title: "", email: "", phone: "", note: "" };

export function EmployeeFormDialog({
  mode,
  employee,
  departments,
  trigger,
  onSaved,
}: {
  mode: "create" | "edit";
  employee?: { id: string } & EmployeeFormValues;
  departments: { id: string; name: string }[];
  trigger?: React.ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<EmployeeFormValues>(employee ?? EMPTY);
  const [pending, setPending] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) setValues(employee ?? EMPTY);
    setOpen(next);
  }

  const set = (k: keyof EmployeeFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      if (mode === "create") {
        await api("/api/employees", { method: "POST", json: values });
        toast.success("已新建员工");
      } else if (employee) {
        await api(`/api/employees/${employee.id}`, { method: "PATCH", json: values });
        toast.success("已保存");
      }
      setOpen(false);
      onSaved?.();
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
            新建员工
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "新建员工" : "编辑员工"}</DialogTitle>
          <DialogDescription>工号是唯一身份；部门不存在时会自动创建。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-no">工号</Label>
              <Input id="emp-no" value={values.employeeNo} onChange={set("employeeNo")} placeholder="如 00123456" required className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-name">姓名</Label>
              <Input id="emp-name" value={values.name} onChange={set("name")} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-dept">部门</Label>
              <Input id="emp-dept" value={values.departmentName} onChange={set("departmentName")} list="employee-departments" placeholder="选择或输入新部门" />
              <datalist id="employee-departments">
                {departments.map((d) => (
                  <option key={d.id} value={d.name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-team">团队</Label>
              <Input id="emp-team" value={values.team} onChange={set("team")} placeholder="可选" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-title">职位</Label>
              <Input id="emp-title" value={values.title} onChange={set("title")} placeholder="可选" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-email">邮箱</Label>
              <Input id="emp-email" value={values.email} onChange={set("email")} placeholder="可选" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-phone">电话</Label>
              <Input id="emp-phone" value={values.phone} onChange={set("phone")} placeholder="可选" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-note">备注</Label>
            <Textarea id="emp-note" value={values.note} onChange={set("note")} rows={2} placeholder="可选" />
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
