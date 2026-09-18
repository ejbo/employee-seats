import { env } from "@/lib/env";
import { llmFetch } from "./egress";
import { isConfigured, resolveLLMConfig, type LLMConfig } from "./config";
import { AnthropicProvider } from "./anthropic";
import { OpenAiProvider } from "./openai";
import type { LLMProvider } from "./types";

export type { LLMProvider, LLMMessage, LLMPart, LLMCompleteOptions, LLMCompletion, LLMUsage } from "./types";
export { resolveLLMConfig, isConfigured } from "./config";
export { extractJsonObject, explainParseFailure, modelReplySample } from "./json";
export { LLMTimeoutError, isLlmCancellation, isLlmTimeout, llmQueueDepth } from "./limits";
export { LLMNetworkError } from "./egress";

export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigError";
  }
}

export function currentLLMConfig(): LLMConfig {
  return resolveLLMConfig(env);
}

export function isLLMConfigured(): boolean {
  return isConfigured(currentLLMConfig());
}

let cached: { key: string; provider: LLMProvider } | null = null;

export function getProvider(): LLMProvider {
  const cfg = currentLLMConfig();
  const key = `${cfg.provider}|${cfg.baseUrl}|${cfg.model}|${cfg.apiKey ? "k" : "-"}`;
  if (cached && cached.key === key) return cached.provider;
  if (!cfg.baseUrl) throw new LLMConfigError("服务端未配置 LLM base URL（设置 LLM_BASE_URL）");
  if (!cfg.model) throw new LLMConfigError("服务端未配置 LLM 模型（设置 LLM_MODEL）");
  let provider: LLMProvider;
  if (cfg.provider === "anthropic") {
    if (!cfg.apiKey) throw new LLMConfigError("服务端未配置 LLM API key（设置 LLM_API_KEY 或 ANTHROPIC_API_KEY）");
    provider = new AnthropicProvider({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model, fetchImpl: llmFetch });
  } else {
    provider = new OpenAiProvider({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model, fetchImpl: llmFetch });
  }
  cached = { key, provider };
  return provider;
}
