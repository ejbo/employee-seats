"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { loginHref } from "@/lib/auth/callback-path";
import { readAuthDest } from "@/lib/auth/pending-dest";

const noopSubscribe = () => () => {};

/**
 * 「重新登录」并带上原本要去的地址。@auth/core 跳到这里时只带 ?error=，
 * 目的地是 W3 按钮点击时留在 sessionStorage 里的面包屑；服务端快照为空，水合后再读。
 */
export function AuthRetryLink({ callbackUrl, className }: { callbackUrl?: string; className?: string }) {
  const remembered = useSyncExternalStore(noopSubscribe, readAuthDest, () => null);
  const href = loginHref(callbackUrl ?? remembered ?? null);
  return (
    <Link href={href} className={className}>
      重新登录
    </Link>
  );
}
