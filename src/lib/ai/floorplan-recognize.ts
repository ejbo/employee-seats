/** 调用视觉模型识别户型图（服务端）。纯函数部分见 ./floorplan.ts。 */
import { getProvider } from "@/lib/llm";
import type { LLMPart } from "@/lib/llm";
import { explainParseFailure, extractJsonObject } from "@/lib/llm/json";
import { normalizeRecognized, recognizedSchema, type Recognized } from "./floorplan";

export const SYSTEM_PROMPT = `你是建筑平面图识别助手。用户会给你一张办公楼层的户型图 / 平面图，请把其中的空间结构提取成 JSON。

坐标系：以图片左上角为原点，x 向右、y 向下，把图片宽和高都归一化到 0–1000（即 x、y 都是 0–1000 的数）。

输出一个 JSON 对象（不要 markdown，不要解释）：
{
  "outline": [[x,y],...],                 // 楼层外轮廓（多边形，顺时针）
  "rooms": [{ "name": "会议室 A", "type": "meeting", "polygon": [[x,y],...], "confidence": 0.9 }],
  "walls": [{ "a": [x,y], "b": [x,y] }], // 不属于任何房间边界的独立墙段（外墙、走廊隔墙）
  "doors": [{ "x": 0, "y": 0, "width": 30 }], // 门的中心点（在墙线上），宽度按归一化单位
  "scaleHints": [{ "text": "6000", "from": [x,y], "to": [x,y], "meters": 6 }], // 图上标注的尺寸线（如有）
  "notes": "补充说明"
}

要求：
- rooms 覆盖所有封闭空间（办公区、会议室、茶水间、卫生间、电梯厅、楼梯间、储物间、前台、走廊）；type 只能是 office|meeting|pantry|restroom|elevator|stairs|storage|reception|corridor|other。
- 房间多边形尽量用直角多边形（每条边水平或垂直），顶点按顺序给出，不要重复首点。
- name 用图上的文字标注；没有就按功能起名（如「办公区 1」）。
- 门用门弧 / 门缝符号识别，给出中心点。
- 图上有尺寸标注（数字 + 尺寸线）时填 scaleHints，数字单位通常是毫米（6000 = 6 米）。
- 看不清的部分给较低的 confidence，不要编造。`;

export interface RecognizeInput {
  image: { mime: "image/jpeg" | "image/png" | "image/webp"; base64: string };
  hints?: string;
  signal?: AbortSignal;
}

export async function recognizeFloorPlan(input: RecognizeInput): Promise<{ result: Recognized; raw: string }> {
  const provider = getProvider();
  const parts: LLMPart[] = [{ type: "image", mime: input.image.mime, base64: input.image.base64 }, { type: "text", text: `请识别这张户型图。${input.hints ? `补充信息：${input.hints}` : ""}` }];
  const reply = await provider.complete({ system: SYSTEM_PROMPT, messages: [{ role: "user", content: parts }], json: true, maxTokens: 6000, signal: input.signal });
  const obj = extractJsonObject(reply.text);
  if (!obj) throw new Error(explainParseFailure("识别户型图", reply));
  const parsed = recognizedSchema.safeParse(obj);
  if (!parsed.success) throw new Error(`识别结果格式不对：${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  return { result: normalizeRecognized(parsed.data), raw: reply.text };
}

