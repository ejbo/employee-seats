import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { apiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { objectTypeInputSchema } from "@/lib/objects/schema";
import { toSummary } from "@/lib/objects/summary";
import type { Prisma } from "@prisma/client";

/** 自定义物件列表（默认只返回启用的；?all=1 返回全部，供管理页）。 */
export async function GET(req: Request) {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const all = new URL(req.url).searchParams.get("all") === "1";
    const rows = await prisma.objectType.findMany({ where: all ? {} : { isActive: true }, orderBy: [{ createdAt: "desc" }] });
    return NextResponse.json({ objects: rows.map(toSummary) });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const input = await parseBody(req, objectTypeInputSchema);
    const key = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const row = await prisma.objectType.create({
      data: { key, name: input.name, category: input.category, w: input.w, d: input.d, h: input.h, spec: { ...input.spec, id: key } as unknown as Prisma.InputJsonValue, thumbnailKey: input.thumbnailKey ?? null, createdById: gate.actor.id },
    });
    await writeAudit(prisma, gate.actor, { action: "object.create", targetType: "objectType", targetId: row.id, summary: `新建自定义物件「${row.name}」（${row.w}×${row.d}×${row.h} cm，${input.spec.parts.length} 个部件）` });
    return NextResponse.json({ object: toSummary(row) }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
