import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, parseBody } from "@/lib/api";
import { isLLMConfigured, isLlmTimeout, LLMNetworkError } from "@/lib/llm";
import { recognizeFloorPlan } from "@/lib/ai/floorplan-recognize";
import { writeAudit } from "@/lib/audit";

export const maxDuration = 300;

const bodySchema = z.object({
  floorId: z.string().min(1),
  image: z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().min(100).max(12_000_000) }),
  hints: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, bodySchema);
    const floor = await prisma.floor.findUnique({ where: { id: body.floorId }, select: { id: true, name: true, officeId: true } });
    if (!floor) throw new ApiError(404, "not_found");
    const gate = await gateApi({ office: floor.officeId, need: "MANAGER" });
    if (!gate.ok) return gate.response;
    if (!isLLMConfigured()) throw new ApiError(503, "ai_not_configured", { message: "服务端未配置 AI 模型（LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL）" });
    const started = Date.now();
    const { result } = await recognizeFloorPlan({ image: body.image, hints: body.hints, signal: req.signal });
    await writeAudit(prisma, gate.actor, {
      action: "floorplan.recognize",
      targetType: "floor",
      targetId: floor.id,
      officeId: floor.officeId,
      floorId: floor.id,
      summary: `识别楼层 ${floor.name} 的户型图：${result.rooms.length} 个房间、${result.walls.length} 段墙、${result.doors.length} 扇门（${Math.round((Date.now() - started) / 1000)}s）`,
    });
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof LLMNetworkError || isLlmTimeout(e)) return apiError(new ApiError(502, "ai_failed", { message: (e as Error).message }));
    if (e instanceof Error && !(e instanceof ApiError) && /识别|模型/.test(e.message)) return apiError(new ApiError(422, "ai_failed", { message: e.message }));
    return apiError(e);
  }
}
