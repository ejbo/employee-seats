import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Building2, ClipboardList, Palette, UserCog } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "管理" };

const CARDS = [
  { href: "/admin/offices", title: "办公室", desc: "新建、编辑、删除办公室与楼层", icon: Building2, ready: true },
  { href: "/admin/departments", title: "部门与颜色", desc: "维护部门列表与地图配色", icon: Palette, ready: true },
  { href: "/admin/users", title: "用户与权限", desc: "查看登录用户与授权，任免管理员", icon: UserCog, ready: true },
  { href: "/admin/audit", title: "变更记录", desc: "谁在何时改了什么", icon: ClipboardList, ready: true },
  { href: "/admin/objects", title: "自定义物件", desc: "照片生成的 3D 物件：查看、改名、停用", icon: Boxes, ready: true },
];

export default async function AdminPage() {
  await requireRole("ADMIN", "/admin");
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">管理</h1>
      <p className="mt-1 text-sm text-muted-foreground">仅管理员可见。</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {CARDS.map(({ href, title, desc, icon: Icon, ready }) =>
          ready ? (
            <Link
              key={href}
              href={href}
              className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{desc}</span>
              </span>
            </Link>
          ) : (
            <div key={href} className="flex items-start gap-4 rounded-2xl border border-dashed border-border p-5 opacity-60">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-medium">
                  {title} <span className="ml-1 text-xs font-normal text-subtle">即将推出</span>
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{desc}</span>
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
