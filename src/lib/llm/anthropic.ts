import type { LLMCompleteOptions, LLMCompletion, LLMMessage, LLMProvider } from "./types";
import { acquireLlmSlot, completeDeadline } from "./limits";

interface AnthropicMessagesResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string | null;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MAX_TOKENS = 8192;

function toAnthropicContent(m: LLMMessage) {
  if (typeof m.content === "string") return m.content;
  return m.content.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: p.mime, data: p.base64 } }));
}

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AnthropicProviderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(opts: LLMCompleteOptions): Promise<LLMCompletion> {
    const release = await acquireLlmSlot(opts.signal);
    const deadline = completeDeadline(opts.signal);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: opts.model ?? this.model,
          max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(opts.system ? { system: opts.system } : {}),
          messages: opts.messages.map((m) => ({ role: m.role, content: toAnthropicContent(m) })),
        }),
        signal: deadline.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Anthropic ${res.status}: ${text.slice(0, 240)}`);
      }
      const json = (await res.json()) as AnthropicMessagesResponse;
      const text = json.content
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("\n");
      return { text, usage: json.usage ? { input: json.usage.input_tokens, output: json.usage.output_tokens } : null, finishReason: json.stop_reason ?? null };
    } finally {
      deadline.dispose();
      release();
    }
  }
}
