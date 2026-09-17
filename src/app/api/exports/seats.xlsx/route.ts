import { z } from "zod";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, parseQuery } from "@/lib/api";
import { buildSeatTableXlsx } from "@/lib/export/seats-xlsx";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const q = parseQuery(req, z.object({ officeId: z.string().optional(), floorId: z.string().optional() }));
    if (!q.officeId && !q.floorId) throw new ApiError(400, "invalid_input", { message: "需要 officeId 或 floorId" });
    const { buffer, filename } = await buildSeatTableXlsx(q);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
