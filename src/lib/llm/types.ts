/**
 * 与提供方无关的 LLM 接口（移植自 skills-community lib/llm，内容扩展为 text + image 分段）。
 * 换模型 / 换提供方只改 env（见 config.ts、index.ts），调用方不动。
 */
export type LLMImagePart = { type: "image"; mime: "image/jpeg" | "image/png" | "image/webp"; base64: string };
export type LLMTextPart = { type: "text"; text: string };
export type LLMPart = LLMTextPart | LLMImagePart;

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | LLMPart[];
}

export interface LLMUsage {
  input: number;
  output: number;
}

export interface LLMCompleteOptions {
  system?: string;
  messages: LLMMessage[];
  maxTokens?: number;
  model?: string;
  /** 希望返回 JSON（只是提示，最终仍走 extractJsonObject） */
  json?: boolean;
  signal?: AbortSignal;
}

export interface LLMCompletion {
  text: string;
  usage: LLMUsage | null;
  /** 'stop' | 'length' | 'max_tokens' | …；length/max_tokens 表示被截断 */
  finishReason?: string | null;
  /** 服务端拆出来的思考过程（vLLM reasoning parser） */
  reasoning?: string | null;
}

export interface LLMProvider {
  readonly id: "anthropic" | "openai-compatible";
  readonly model: string;
  complete(opts: LLMCompleteOptions): Promise<LLMCompletion>;
}
