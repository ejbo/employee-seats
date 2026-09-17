"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { sanitizeCallbackPath } from "@/lib/auth/callback-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DevLoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [w3Id, setW3Id] = useState("00000001");
  const [name, setName] = useState("开发管理员");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await signIn("dev", { w3Id, name, redirect: false });
      if (!res || res.error) {
        setMsg("登录失败：工号需为 4–12 位数字（可带一位字母前缀）。");
        return;
      }
      // 路由器会自己补 basePath；sanitize 保证不会变成开放重定向。
      router.push(sanitizeCallbackPath(callbackUrl, process.env.NEXT_PUBLIC_BASE_PATH ?? ""));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="dev-w3id">工号</Label>
        <Input
          id="dev-w3id"
          value={w3Id}
          onChange={(e) => setW3Id(e.target.value)}
          autoComplete="username"
          required
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dev-name">姓名</Label>
        <Input id="dev-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      {msg && <p className="text-sm text-danger">{msg}</p>}
      <Button type="submit" disabled={pending} variant="outline" className="h-10 w-full rounded-xl">
        {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
        登录
      </Button>
    </form>
  );
}
