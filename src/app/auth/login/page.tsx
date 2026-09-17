import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CornerDownLeft, MapPinned, ShieldCheck, TriangleAlert } from "lucide-react";
import { auth, isDevLoginEnabled, isSsoEnabled } from "@/lib/auth";
import { isReturnableDest, sanitizeCallbackPath } from "@/lib/auth/callback-path";
import { withBasePath } from "@/lib/base-path";
import { HuaweiLoginButton } from "./huawei-login-button";
import { DevLoginForm } from "./dev-login-form";

export const metadata: Metadata = { title: "登录" };

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const callbackUrl = firstParam(sp.callbackUrl) || undefined;

  const session = await auth();
  if (session?.user?.id) redirect(sanitizeCallbackPath(callbackUrl, basePath));

  // 错误码来自查询串，只保留安全字符后展示给用户（便于转述给管理员排查）。
  const rawError = firstParam(sp.error);
  const errorCode = rawError ? rawError.replace(/[^\w.-]/g, "").slice(0, 64) || "Default" : undefined;

  const returnTo = sanitizeCallbackPath(callbackUrl, basePath);
  const hasReturn = isReturnableDest(returnTo);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="animate-rise w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <MapPinned className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">办公室座位图</h1>
          <p className="mt-2 text-sm text-muted-foreground">登录后即可查看每位同事的座位。</p>
        </div>

        {hasReturn && (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <CornerDownLeft className="mt-px h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              登录后将带你回到
              <span className="mt-0.5 block truncate font-mono text-[11px] text-foreground">{withBasePath(returnTo)}</span>
            </span>
          </p>
        )}

        {errorCode && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-danger">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              登录未完成
            </p>
            <p className="mt-1.5 leading-relaxed text-muted-foreground">
              请重试一次；若持续失败，请把错误码 <span className="font-mono text-foreground">{errorCode}</span> 告知管理员。
            </p>
          </div>
        )}

        <div className="space-y-4">
          {isSsoEnabled && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-lift">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4" />
                华为账号登录
              </div>
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">跳转到 UniPortal 完成认证后自动返回。</p>
              <HuaweiLoginButton callbackUrl={callbackUrl} />
            </div>
          )}

          {isDevLoginEnabled && (
            <div className="rounded-2xl border border-dashed border-warning/60 bg-warning/5 p-5">
              <div className="mb-1 text-sm font-semibold">开发登录</div>
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                仅本地开发可用：输入工号与姓名即可登录，不经过 UniPortal。
              </p>
              <DevLoginForm callbackUrl={callbackUrl} />
            </div>
          )}

          {!isSsoEnabled && !isDevLoginEnabled && (
            <p className="text-center text-sm text-danger">未配置任何登录方式，请检查环境变量。</p>
          )}
        </div>
      </div>
    </main>
  );
}
