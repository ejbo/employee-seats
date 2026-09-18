import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, parseBody } from "@/lib/api";
import { isLLMConfigured, isLlmTimeout, LLMNetworkError } from "@/lib/llm";
import { recognizeObject } from "@/lib/ai/object-recognize";
import { generatedObjectSchema, toObjectSpec } from "@/lib/ai/object-spec-schema";

export const maxDuration = 300;

const bodySchema = z.object({
  image: z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().min(100).max(12_000_000) }),
  prompt: z.string().max(300).optional(),
  previous: generatedObjectSchema.optional(),
  feedback: z.string().max(300).optional(),
});

/** 照片 → 参数化物件（办公室管理员及以上：能编辑布局的人才需要建物件）。 */
export async function POST(req: Request) {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    if (gate.actor.role === "USER") {
      const anyOffice = await prisma.officePermission.count({ where: { userId: gate.actor.id, role: "MANAGER" } });
      if (!anyOffice) throw new ApiError(403, "forbidden");
    }
    if (!isLLMConfigured()) throw new ApiError(503, "ai_not_configured", { message: "服务端未配置 AI 模型（LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL）" });
    const body = await parseBody(req, bodySchema);
    const { result } = await recognizeObject({ image: body.image, prompt: body.prompt, previous: body.previous, feedback: body.feedback, signal: req.signal });
    const spec = toObjectSpec(result, `custom-${Date.now().toString(36)}`);
    return NextResponse.json({ result, spec });
  } catch (e) {
    if (e instanceof ApiError) return apiError(e);
    if (e instanceof LLMNetworkError || isLlmTimeout(e) || (e instanceof Error && !(e instanceof ZodError))) {
      // 模型侧的任何失败（鉴权 / 限流 / 网络 / 没返回 JSON）都以可读信息返回给前端
      return apiError(new ApiError(502, "ai_failed", { message: (e as Error).message }));
    }
    return apiError(e);
  }
}
