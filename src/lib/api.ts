import "server-only";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodType } from "zod";

/** 业务错误：直接映射成 HTTP 状态码 + 错误码。 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status });
}

/**
 * 统一错误出口：路由处理器 `try { … } catch (e) { return apiError(e); }`。
 * ApiError → 自身状态码；Zod → 400；Prisma 唯一冲突 → 409；找不到 → 404；其余 500（并打日志）。
 */
export function apiError(e: unknown): NextResponse {
  if (e instanceof ApiError) return json(e.status, { error: e.code, ...(e.extra ?? {}) });
  if (e instanceof ZodError) return json(400, { error: "invalid_input", issues: e.issues });
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return json(409, { error: "conflict", target: e.meta?.target ?? null });
    if (e.code === "P2025") return json(404, { error: "not_found" });
    if (e.code === "P2034") return json(409, { error: "conflict" });
  }
  console.error("[api] unhandled error", e);
  return json(500, { error: "internal_error" });
}

/** 解析 JSON 请求体并用 zod 校验（失败抛 ApiError/ZodError，交给 apiError）。 */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json");
  }
  return schema.parse(data);
}

/** 解析查询参数（重复键只取第一个）。 */
export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (!(k in obj)) obj[k] = v;
  });
  return schema.parse(obj);
}
