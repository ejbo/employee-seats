import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { floorInputSchema } from "@/lib/offices/schema";
import { EMPTY_DECOR } from "@/lib/map/types";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id: officeId } = await params;
    const gate = await gateApi({ office: officeId, need: "MANAGER" });
    if (!gate.ok) return gate.response;
    const office = await prisma.office.findUnique({ where: { id: officeId }, select: { id: true, name: true } });
    if (!office) throw new ApiError(404, "not_found");
    const input = await parseBody(req, floorInputSchema);
    const dup = await prisma.floor.findUnique({ where: { officeId_name: { officeId, name: input.name } } });
    if (dup) throw new ApiError(409, "floor_exists");
    const floor = await prisma.floor.create({
      data: { ...input, officeId, decor: EMPTY_DECOR as unknown as Prisma.InputJsonValue },
    });
    await writeAudit(prisma, gate.actor, {
      action: "floor.create",
      targetType: "floor",
      targetId: floor.id,
      officeId,
      floorId: floor.id,
      after: input,
      summary: `新建楼层 ${office.name} / ${input.name}`,
    });
    return NextResponse.json({ floor }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
