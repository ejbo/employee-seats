import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { gateApi, loadOfficeCapabilities } from "@/lib/auth/guards";
import { apiError, json, parseQuery } from "@/lib/api";
import { isAdmin } from "@/lib/permissions";

const querySchema = z.object({
  officeId: z.string().optional(),
  action: z.string().max(64).optional(),
  q: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: Request) {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const q = parseQuery(req, querySchema);
    if (!isAdmin(gate.actor.role)) {
      if (!q.officeId) return json(403, { error: "forbidden", need: "ADMIN" });
      const caps = await loadOfficeCapabilities(gate.actor, q.officeId);
      if (!caps.canEditLayout) return json(403, { error: "forbidden", need: "MANAGER", officeId: q.officeId });
    }
    const where: Prisma.AuditLogWhereInput = {};
    if (q.officeId) where.officeId = q.officeId;
    if (q.action) where.action = q.action.endsWith(".") ? { startsWith: q.action } : q.action;
    if (q.q) where.OR = [{ summary: { contains: q.q, mode: "insensitive" } }, { actorName: { contains: q.q, mode: "insensitive" } }, { actorW3Id: { contains: q.q } }];
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, action: true, summary: true, actorName: true, actorW3Id: true, officeId: true, floorId: true, targetType: true, targetId: true, batchId: true, createdAt: true },
      }),
    ]);
    const officeIds = Array.from(new Set(items.map((i) => i.officeId).filter((x): x is string => Boolean(x))));
    const floorIds = Array.from(new Set(items.map((i) => i.floorId).filter((x): x is string => Boolean(x))));
    const [offices, floors] = await Promise.all([
      prisma.office.findMany({ where: { id: { in: officeIds } }, select: { id: true, name: true } }),
      prisma.floor.findMany({ where: { id: { in: floorIds } }, select: { id: true, name: true } }),
    ]);
    const officeName = new Map(offices.map((o) => [o.id, o.name]));
    const floorName = new Map(floors.map((f) => [f.id, f.name]));
    return NextResponse.json({
      items: items.map((i) => ({ ...i, officeName: i.officeId ? (officeName.get(i.officeId) ?? null) : null, floorName: i.floorId ? (floorName.get(i.floorId) ?? null) : null })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (e) {
    return apiError(e);
  }
}
