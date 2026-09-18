/** 从环境变量解析 LLM 配置；纯函数，便于测试。 */
export type LLMProviderId = "anthropic" | "openai-compatible";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
/** 内网 ai4news 模型网关（OpenAI 兼容）的默认视觉模型 */
export const INTRANET_GATEWAY_URL = "https://ai4news.rnd.huawei.com/model/v1";
export const INTRANET_VISION_MODEL = "zai-org/GLM-4.6V";

export interface LLMConfig {
  provider: LLMProviderId;
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  useProxy: boolean;
}

export interface LLMEnvInput {
  LLM_PROVIDER?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_USE_PROXY?: boolean;
  ANTHROPIC_API_KEY?: string;
}

function normalizeProvider(raw: string | undefined): LLMProviderId {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "openai" || v === "openai-compatible") return "openai-compatible";
  return "anthropic";
}

export function resolveLLMConfig(env: LLMEnvInput): LLMConfig {
  const provider = normalizeProvider(env.LLM_PROVIDER);
  const apiKey = env.LLM_API_KEY ?? (provider === "anthropic" ? env.ANTHROPIC_API_KEY : undefined);
  const baseUrl = env.LLM_BASE_URL ?? (provider === "anthropic" ? DEFAULT_ANTHROPIC_BASE_URL : "");
  const model = env.LLM_MODEL ?? (provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : "");
  return { provider, apiKey, baseUrl, model, useProxy: env.LLM_USE_PROXY ?? false };
}

/** 有足够信息可以调用模型：Anthropic 需要 key，OpenAI 兼容端点常常免 key。 */
export function isConfigured(cfg: LLMConfig): boolean {
  if (!cfg.model || !cfg.baseUrl) return false;
  return cfg.provider === "anthropic" ? Boolean(cfg.apiKey) : true;
}
