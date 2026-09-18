/**
 * LLM 出口：默认直连（内网网关不走代理）；LLM_USE_PROXY=true 时按 src/lib/net/proxy 的规则走公司代理
 * （公网的 api.anthropic.com 需要）。失败信息里写清端点、路线与 errno。
 */
import { fetch as undiciFetch } from "undici";
import { env } from "@/lib/env";
import { egressFor } from "@/lib/net/proxy";
import { isLlmCancellation } from "./limits";

export class LLMNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LLMNetworkError";
  }
}

function endpointOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

export const llmFetch: typeof fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
  const url = typeof input === "string" || input instanceof URL ? String(input) : (input as Request).url;
  const eg = env.LLM_USE_PROXY ? egressFor(url) : ({ dispatcher: undefined, via: "direct", proxyUri: null } as const);
  try {
    if (eg.dispatcher) {
      const opts = { ...(init ?? {}), dispatcher: eg.dispatcher } as Parameters<typeof undiciFetch>[1];
      return (await undiciFetch(url, opts)) as unknown as Response;
    }
    return await fetch(input, init);
  } catch (e) {
    if (isLlmCancellation(e)) throw e;
    const err = e as NodeJS.ErrnoException & { cause?: unknown };
    const cause = err?.cause instanceof Error ? (err.cause as NodeJS.ErrnoException) : undefined;
    const code = err?.code ?? cause?.code ?? "";
    const detail = [err?.message, cause?.message].filter(Boolean).join(" ← ");
    const route = eg.via === "proxy" ? `经代理 ${eg.proxyUri}` : "直连";
    const hint = eg.via === "proxy" ? "内网模型不要走代理：把 LLM_USE_PROXY 设为 false" : code === "ENOTFOUND" || code === "EAI_AGAIN" ? "外网模型需要设置 LLM_USE_PROXY=true" : "检查模型地址与端口是否可从本机直接访问";
    console.error("[llm] request failed", { url, via: eg.via, proxy: eg.proxyUri, code, detail });
    throw new LLMNetworkError(`调用模型失败（${route} ${endpointOf(url)}）：${code ? `${code} ` : ""}${detail}。${hint}`, { cause: e });
  }
}) as typeof fetch;
