import { NextResponse } from "next/server";
import { gateApi } from "@/lib/auth/guards";
import { apiError } from "@/lib/api";
import { currentLLMConfig, isLLMConfigured } from "@/lib/llm";

/** AI 能力是否可用（前端据此决定走识别向导还是手动描摹）。 */
export async function GET() {
  try {
    const gate = await gateApi({});
    if (!gate.ok) return gate.response;
    const cfg = currentLLMConfig();
    const configured = isLLMConfigured();
    return NextResponse.json({ configured, provider: configured ? cfg.provider : null, model: configured ? cfg.model : null });
  } catch (e) {
    return apiError(e);
  }
}
