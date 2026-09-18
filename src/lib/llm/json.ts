/**
 * 从模型回复里挖出第一个能解析的 JSON 对象：剥掉 <think>…</think>（含未闭合的）、代码围栏，
 * 逐个候选 `{` 做括号匹配（尊重字符串），最后再试一次全角标点归一。
 */
import type { LLMCompletion } from "./types";

const FULL_WIDTH: Record<string, string> = { "｛": "{", "｝": "}", "［": "[", "］": "]", "：": ":", "，": ",", "＂": '"' };
const MAX_CANDIDATES = 24;

function stripReasoning(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const open = t.indexOf("<think>");
  if (open >= 0) t = t.slice(0, open) + t.slice(open + 7); // 未闭合：思考内容里可能就有答案，保留
  t = t.replace(/```(?:json|JSON)?/g, "");
  return t;
}

/** 从 i 开始做括号匹配，返回可解析的对象；解析失败返回 null。 */
function parseObjectAt(s: string, i: number): Record<string, unknown> | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const v = JSON.parse(s.slice(i, j + 1));
          return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function mine(region: string): Record<string, unknown> | null {
  let tried = 0;
  for (let i = region.indexOf("{"); i >= 0; i = region.indexOf("{", i + 1)) {
    if (++tried > MAX_CANDIDATES) break;
    const obj = parseObjectAt(region, i);
    if (obj) return obj;
  }
  return null;
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const region = stripReasoning(text);
  const hit = mine(region);
  if (hit) return hit;
  if (!region.includes("{") && region.includes("｛")) return mine(region.replace(/[｛｝［］：，＂]/g, (c) => FULL_WIDTH[c] ?? c));
  return null;
}

export function modelReplySample(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "（空响应）";
  const flat = trimmed.replace(/\s+/g, " ");
  return flat.length > 200 ? `${flat.slice(0, 200)}…` : flat;
}

/** 把「模型没按要求返回 JSON」拆成三种可操作的原因。 */
export function explainParseFailure(stage: string, reply: Pick<LLMCompletion, "text" | "finishReason" | "reasoning">): string {
  const { text, finishReason, reasoning } = reply;
  if (finishReason === "length" || finishReason === "max_tokens") {
    return `${stage}：模型输出被 max_tokens 截断（finish_reason=${finishReason}），通常是推理模型把预算花在了 <think> 里；请关闭 thinking 或调大预算。已收到：${modelReplySample(text || reasoning || "")}`;
  }
  if (!text.trim() && reasoning) return `${stage}：模型只返回了思考过程，正文为空。思考片段：${modelReplySample(reasoning)}`;
  return `${stage}：模型没有按要求返回 JSON。模型实际返回：${modelReplySample(text)}`;
}
