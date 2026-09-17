import { NextResponse, type NextRequest } from "next/server";

/**
 * 只做一件事：把当前请求路径（不含 basePath、含查询串）发布为 `x-pathname` 请求头，
 * 让服务端布局在把匿名访客送去登录页时能带上回跳地址（src/lib/auth/guards.ts）。
 *
 * 这里绝不做鉴权：边缘中间件在反向代理 + 子路径后面读不到安全 cookie，会把已登录
 * 的人误判为未登录。门禁全部在服务端组件 / 路由处理器里做。
 *
 * 必须克隆入站请求头再 set（Next 会删掉未声明覆盖的请求头，裸 new Headers 会丢 cookie）。
 * matcher 不含 basePath（Next 构建时自动加前缀）；裸 "/" 必须单独列出。
 */
export function proxy(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/",
    "/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|mjs|js|css|map|ttf|otf|woff|woff2)$).*)",
  ],
};
