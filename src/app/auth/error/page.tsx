import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AuthRetryLink } from "./auth-retry-link";

export const metadata: Metadata = { title: "登录出错" };

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

const DESCRIPTIONS: Record<string, string> = {
  configuration: "服务端登录配置有误（client_id / secret / 回调地址）。",
  accessdenied: "该账号无法登录（可能已被停用）。",
  verification: "登录凭证已过期或已被使用，请重新登录。",
  default: "登录过程中出现了问题。",
};

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  let code = firstParam(sp.error).replace(/[^\w.-]/g, "").slice(0, 64) || "Default";
  if (/^(undefined|null)$/i.test(code)) code = "Default";
  const desc = DESCRIPTIONS[code.toLowerCase()] ?? DESCRIPTIONS.default;
  const callbackUrl = firstParam(sp.callbackUrl) || undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="animate-rise w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-lift">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <TriangleAlert className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">登录未完成</h1>
        <p className="mt-3 text-sm text-muted-foreground">{desc}</p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
          错误码：{code}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">若反复出现，请把错误码告知管理员。</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <AuthRetryLink
            callbackUrl={callbackUrl}
            className="flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          />
          <Link
            href="/"
            className="flex h-10 items-center justify-center rounded-lg border border-border px-5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            回到首页
          </Link>
        </div>
      </div>
    </main>
  );
}
