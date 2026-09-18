import type { LLMCompleteOptions, LLMCompletion, LLMMessage, LLMProvider } from "./types";
import { acquireLlmSlot, completeDeadline } from "./limits";

interface OpenAiChatResponse {
  choices: Array<{ message?: { content?: string | Array<{ type: string; text?: string }>; reasoning_content?: string; reasoning?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface OpenAiProviderOptions {
  apiKey?: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

function toOpenAiContent(m: LLMMessage) {
  if (typeof m.content === "string") return m.content;
  return m.content.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: `data:${p.mime};base64,${p.base64}` } }));
}

export class OpenAiProvider implements LLMProvider {
  readonly id = "openai-compatible" as const;
  readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly useCompletionTokens: boolean;

  constructor(opts: OpenAiProviderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.useCompletionTokens = /api\.openai\.com/.test(this.baseUrl);
  }

  async complete(opts: LLMCompleteOptions): Promise<LLMCompletion> {
    const release = await acquireLlmSlot(opts.signal);
    const deadline = completeDeadline(opts.signal);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
      const messages = [...(opts.system ? [{ role: "system" as const, content: opts.system }] : []), ...opts.messages.map((m) => ({ role: m.role, content: toOpenAiContent(m) }))];
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        // 不用 response_format：自建 vLLM 上不稳定，统一走 extractJsonObject。
        // 公网 OpenAI 新模型只认 max_completion_tokens（max_tokens 会 400）；自建 vLLM / 网关仍用 max_tokens。
        body: JSON.stringify({ model: opts.model ?? this.model, ...(opts.maxTokens ? { [this.useCompletionTokens ? "max_completion_tokens" : "max_tokens"]: opts.maxTokens } : {}), stream: false, messages }),
        signal: deadline.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`LLM ${res.status}: ${text.slice(0, 240)}`);
      }
      const json = (await res.json()) as OpenAiChatResponse;
      const choice = json.choices?.[0];
      const message = choice?.message;
      const content = message?.content;
      const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => p.text ?? "").join("") : "";
      return {
        text,
        usage: json.usage ? { input: json.usage.prompt_tokens, output: json.usage.completion_tokens } : null,
        finishReason: choice?.finish_reason ?? null,
        reasoning: message?.reasoning_content ?? message?.reasoning ?? null,
      };
    } finally {
      deadline.dispose();
      release();
    }
  }
}
