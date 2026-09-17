/** 客户端调用本应用 API 的小封装（basePath 由 patch-fetch 垫片处理）。 */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly body: Record<string, unknown> | null,
  ) {
    super(code);
    this.name = "ApiClientError";
  }
}

export interface ApiInit extends Omit<RequestInit, "body"> {
  json?: unknown;
  body?: BodyInit | null;
}

export async function api<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const code = typeof body?.error === "string" ? (body.error as string) : "internal_error";
    throw new ApiClientError(res.status, code, body);
  }
  return body as T;
}

export const fetcher = <T = unknown>(url: string) => api<T>(url);
