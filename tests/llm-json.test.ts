import { describe, expect, it } from "vitest";
import { extractJsonObject, explainParseFailure } from "../src/lib/llm/json";
import { isConfigured, resolveLLMConfig } from "../src/lib/llm/config";

describe("extractJsonObject", () => {
  it("finds the object inside prose and code fences", () => {
    expect(extractJsonObject('好的，结果如下：\n```json\n{"a": 1, "b": {"c": [1, 2]}}\n```\n以上')).toEqual({ a: 1, b: { c: [1, 2] } });
  });
  it("strips think blocks and tolerates braces inside strings", () => {
    expect(extractJsonObject('<think>{"draft": 1}</think>{"name": "会议室 {A}", "n": 2}')).toEqual({ name: "会议室 {A}", n: 2 });
  });
  it("normalizes full-width punctuation as a last resort", () => {
    expect(extractJsonObject("｛＂a＂：1，＂b＂：［2］｝")).toEqual({ a: 1, b: [2] });
  });
  it("returns null when nothing parses", () => {
    expect(extractJsonObject("no json here {broken")).toBeNull();
  });
  it("explains truncation and empty replies", () => {
    expect(explainParseFailure("识别", { text: "", finishReason: "length", reasoning: "…" })).toContain("截断");
    expect(explainParseFailure("识别", { text: "", finishReason: "stop", reasoning: "thinking" })).toContain("思考过程");
    expect(explainParseFailure("识别", { text: "nope", finishReason: "stop", reasoning: null })).toContain("nope");
  });
});

describe("resolveLLMConfig", () => {
  it("defaults to anthropic with the legacy key", () => {
    const cfg = resolveLLMConfig({ ANTHROPIC_API_KEY: "k" });
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.baseUrl).toBe("https://api.anthropic.com");
    expect(isConfigured(cfg)).toBe(true);
  });
  it("borrows OPENAI_API_KEY for the openai-compatible provider and defaults to api.openai.com", () => {
    const cfg = resolveLLMConfig({ LLM_PROVIDER: "openai-compatible", OPENAI_API_KEY: "sk-x" });
    expect(cfg.baseUrl).toBe("https://api.openai.com/v1");
    expect(cfg.apiKey).toBe("sk-x");
    expect(cfg.model).toBe("gpt-4.1");
    expect(isConfigured(cfg)).toBe(true);
    // 显式 LLM_API_KEY / LLM_BASE_URL 优先（内网网关）
    const gw = resolveLLMConfig({ LLM_PROVIDER: "openai", LLM_BASE_URL: "https://gw/v1", LLM_MODEL: "m", LLM_API_KEY: "k", OPENAI_API_KEY: "sk-x" });
    expect(gw.apiKey).toBe("k");
    expect(gw.baseUrl).toBe("https://gw/v1");
  });
  it("treats an openai-compatible endpoint as configured without a key", () => {
    const cfg = resolveLLMConfig({ LLM_PROVIDER: "openai", LLM_BASE_URL: "https://gw/v1", LLM_MODEL: "m" });
    expect(cfg.provider).toBe("openai-compatible");
    expect(isConfigured(cfg)).toBe(true);
    expect(isConfigured(resolveLLMConfig({ LLM_PROVIDER: "openai" }))).toBe(false);
  });
});
