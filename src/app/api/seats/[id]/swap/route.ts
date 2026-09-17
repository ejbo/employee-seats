import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { gateApi, loadOfficeCapabilities } from "@/lib/auth/guards";
import { ApiError, apiError, json, parseBody } from "@/lib/api";
import { swapSeats } from "@/lib/seats/assign";

const bodySchema = z.object({ otherSeatId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await parseBody(req, bodySchema);
    const [a, b] = await Promise.all([
      prisma.seat.findUnique({ where: { id }, select: { officeId: true } }),
      prisma.seat.findUnique({ where: { id: body.otherSeatId }, select: { officeId: true } }),
    ]);
    if (!a || !b) throw new ApiError(404, "not_found");
    const gate = await gateApi({ office: a.officeId, need: "EDITOR" });
    if (!gate.ok) return gate.response;
    if (b.officeId !== a.officeId) {
      const caps = await loadOfficeCapabilities(gate.actor, b.officeId);
      if (!caps.canAssign) return json(403, { error: "forbidden", need: "EDITOR", officeId: b.officeId });
    }
    return NextResponse.json(await swapSeats(gate.actor, id, body.otherSeatId));
  } catch (e) {
    return apiError(e);
  }
}
