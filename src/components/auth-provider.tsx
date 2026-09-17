"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { SessionProvider, getSession } from "next-auth/react";
import type { Session } from "next-auth";
import { installApiBasePathFetch } from "@/lib/patch-fetch";

// 尽早安装 basePath fetch 垫片：子路径部署下所有客户端 fetch('/api/...') 才会打到本应用。
// 根部署 / 服务端为 no-op。
installApiBasePathFetch();

// next-auth 的客户端把 API 基址默认为 "/api/auth"，不认识 Next 的 basePath；
// 子路径部署时 signIn()/signOut() 会打到宿主根路径（另一个应用）。这里钉死。
const AUTH_BASE_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth`;

/**
 * 可见标签页的 session 轮询周期（秒）。要小于 src/lib/auth/index.ts 的 ROLE_CLAIMS_TTL_MS（90s）：
 * 只有 /api/auth/session 会重新签发 cookie，轮询就是让角色变更在一分钟内落地的机制。
 * 隐藏的标签页完全不轮询（见下），回到前台时再同步一次。
 */
const VISIBLE_REFETCH_SECONDS = 60;
/** 回到前台时最多多久同步一次，避免频繁切换标签页变成请求风暴。 */
const RESYNC_MIN_GAP_MS = 30_000;

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

export function AuthProvider({ session, children }: { session: Session | null; children: React.ReactNode }) {
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
  // 服务端刚渲染出 session，挂载即视为一次同步点：页面加载本身不多发请求。
  const lastSyncRef = useRef<number | null>(null);
  const signedIn = session !== null;

  useEffect(() => {
    if (lastSyncRef.current === null) lastSyncRef.current = Date.now();
    const onVisibility = () => {
      if (document.visibilityState !== "visible" || !signedIn) return;
      if (Date.now() - (lastSyncRef.current ?? 0) < RESYNC_MIN_GAP_MS) return;
      lastSyncRef.current = Date.now();
      // broadcast:false —— 只发这一次请求，不向其他标签页扇出。
      void getSession({ broadcast: false });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [signedIn]);

  return (
    <SessionProvider
      session={session}
      basePath={AUTH_BASE_PATH}
      refetchOnWindowFocus={false}
      refetchInterval={visible ? VISIBLE_REFETCH_SECONDS : 0}
    >
      {children}
    </SessionProvider>
  );
}
