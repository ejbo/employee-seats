import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { objectTypePatchSchema } from "@/lib/objects/schema";
import { toSummary } from "@/lib/objects/summary";
import type { Prisma } from "@prisma/client";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const gate = await gateApi({ role: "ADMIN" });
    if (!gate.ok) return gate.response;
    const input = await parseBody(req, objectTypePatchSchema);
    const existing = await prisma.objectType.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "not_found");
    const row = await prisma.objectType.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.w !== undefined ? { w: input.w } : {}),
        ...(input.d !== undefined ? { d: input.d } : {}),
        ...(input.h !== undefined ? { h: input.h } : {}),
        ...(input.spec !== undefined ? { spec: { ...input.spec, id: existing.key } as unknown as Prisma.InputJsonValue } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.thumbnailKey !== undefined ? { thumbnailKey: input.thumbnailKey } : {}),
      },
    });
    await writeAudit(prisma, gate.actor, { action: "object.update", targetType: "objectType", targetId: id, summary: `更新自定义物件「${row.name}」${input.isActive === false ? "（停用）" : input.isActive === true ? "（启用）" : ""}` });
    return NextResponse.json({ object: toSummary(row) });
  } catch (e) {
    return apiError(e);
  }
}
