import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { ObjectManager } from "@/components/admin/object-manager";

export const metadata: Metadata = { title: "自定义物件" };

export default async function AdminObjectsPage() {
  await requireRole("ADMIN", "/admin/objects");
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">自定义物件</h1>
      <p className="mt-1 text-sm text-muted-foreground">由照片生成的参数化 3D 物件。停用后不再出现在物件库，已放置的实例保留但保存时会提示。</p>
      <ObjectManager />
    </div>
  );
}
