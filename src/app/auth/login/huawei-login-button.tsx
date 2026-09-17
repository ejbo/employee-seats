"use client";

import { signIn } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { sanitizeCallbackPath } from "@/lib/auth/callback-path";
import { rememberAuthDest } from "@/lib/auth/pending-dest";
import { Button } from "@/components/ui/button";

export function HuaweiLoginButton({ callbackUrl }: { callbackUrl?: string }) {
  // W3 流程以服务端重定向结束（不经 Next 路由），落地地址不会自动带 basePath，这里自己补上。
  // 先 sanitize：拒绝绝对地址 / 协议相对地址，并去掉已带的 basePath，避免双前缀或逃逸。
  const appPath = sanitizeCallbackPath(callbackUrl, process.env.NEXT_PUBLIC_BASE_PATH ?? "");
  const dest = withBasePath(appPath);
  return (
    <Button
      type="button"
      className="h-11 w-full gap-2 rounded-xl text-sm"
      onClick={() => {
        // 给 /auth/error 留面包屑：回调失败时 @auth/core 会丢掉 callbackUrl。
        rememberAuthDest(appPath);
        void signIn("huawei", { callbackUrl: dest });
      }}
    >
      <ShieldCheck className="h-4 w-4" />
      使用华为账号登录
    </Button>
  );
}
