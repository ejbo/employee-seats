import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError } from "@/lib/api";
import { releaseSeat } from "@/lib/seats/assign";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const seat = await prisma.seat.findUnique({ where: { id }, select: { officeId: true } });
    if (!seat) throw new ApiError(404, "not_found");
    const gate = await gateApi({ office: seat.officeId, need: "EDITOR" });
    if (!gate.ok) return gate.response;
    return NextResponse.json(await releaseSeat(gate.actor, id));
  } catch (e) {
    return apiError(e);
  }
}
