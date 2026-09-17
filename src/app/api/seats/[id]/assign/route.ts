import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, parseBody } from "@/lib/api";
import { assignSeat } from "@/lib/seats/assign";

const bodySchema = z.object({
  employeeId: z.string().min(1),
  allowMove: z.boolean().optional(),
  allowReplace: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const seat = await prisma.seat.findUnique({ where: { id }, select: { officeId: true } });
    if (!seat) throw new ApiError(404, "not_found");
    const gate = await gateApi({ office: seat.officeId, need: "EDITOR" });
    if (!gate.ok) return gate.response;
    const body = await parseBody(req, bodySchema);
    const result = await assignSeat(gate.actor, id, body.employeeId, { allowMove: body.allowMove, allowReplace: body.allowReplace });
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}
