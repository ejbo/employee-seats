import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const floor = await prisma.floor.findUnique({ where: { id }, select: { version: true, updatedAt: true } });
    if (!floor) throw new ApiError(404, "not_found");
    return NextResponse.json(floor);
  } catch (e) {
    return apiError(e);
  }
}
