/** 照片 → GeneratedObject（服务端调用视觉模型）。支持带上一次结果 + 反馈的再生成。 */
import { getProvider } from "@/lib/llm";
import type { LLMMessage, LLMPart } from "@/lib/llm";
import { explainParseFailure, extractJsonObject } from "@/lib/llm/json";
import { generatedObjectSchema, OBJECT_SYSTEM_PROMPT, type GeneratedObject } from "./object-spec-schema";

export interface RecognizeObjectInput {
  image: { mime: "image/jpeg" | "image/png" | "image/webp"; base64: string };
  prompt?: string;
  previous?: GeneratedObject;
  feedback?: string;
  signal?: AbortSignal;
}

export async function recognizeObject(input: RecognizeObjectInput): Promise<{ result: GeneratedObject; raw: string }> {
  const provider = getProvider();
  const parts: LLMPart[] = [{ type: "image", mime: input.image.mime, base64: input.image.base64 }, { type: "text", text: `请把这个物件建成参数化模型。${input.prompt ? `要求：${input.prompt}` : ""}` }];
  const messages: LLMMessage[] = [{ role: "user", content: parts }];
  if (input.previous && input.feedback) {
    messages.push({ role: "assistant", content: JSON.stringify(input.previous) });
    messages.push({ role: "user", content: `请根据反馈修改后重新输出完整 JSON：${input.feedback}` });
  }
  const reply = await provider.complete({ system: OBJECT_SYSTEM_PROMPT, messages, json: true, maxTokens: 6000, signal: input.signal });
  const obj = extractJsonObject(reply.text);
  if (!obj) throw new Error(explainParseFailure("生成物件", reply));
  const parsed = generatedObjectSchema.safeParse(obj);
  if (!parsed.success) throw new Error(`生成结果格式不对：${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  return { result: parsed.data, raw: reply.text };
}
