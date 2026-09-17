import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi, loadOfficeCapabilities } from "@/lib/auth/guards";
import { ApiError, apiError, parseBody } from "@/lib/api";
import { layoutSaveSchema } from "@/lib/floors/ops-schema";
import { saveLayout } from "@/lib/floors/layout";
import { loadFloorPageData } from "@/lib/floors/scene";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const floor = await prisma.floor.findUnique({ where: { id }, select: { officeId: true } });
    if (!floor) throw new ApiError(404, "not_found");
    const gate = await gateApi({ office: floor.officeId, need: "MANAGER" });
    if (!gate.ok) return gate.response;
    const body = await parseBody(req, layoutSaveSchema);
    const result = await saveLayout(gate.actor, id, body);
    const data = await loadFloorPageData(id);
    const viewer = await loadOfficeCapabilities(gate.actor, floor.officeId);
    return NextResponse.json({ ...result, ...data, viewer });
  } catch (e) {
    return apiError(e);
  }
}
