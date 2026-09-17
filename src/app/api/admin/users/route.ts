import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { apiError, parseQuery } from "@/lib/api";

const querySchema = z.object({
  q: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: Request) {
  try {
    const gate = await gateApi({ role: "ADMIN" });
    if (!gate.ok) return gate.response;
    const q = parseQuery(req, querySchema);
    const where = q.q
      ? { OR: [{ displayName: { contains: q.q, mode: "insensitive" as const } }, { huaweiW3Id: { contains: q.q.replace(/\D+/g, "") || q.q } }] }
      : {};
    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ role: "desc" }, { lastLoginAt: { sort: "desc", nulls: "last" } }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          huaweiW3Id: true,
          displayName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          employee: { select: { name: true, department: { select: { name: true } } } },
          grants: { select: { role: true, office: { select: { id: true, name: true } } } },
        },
      }),
    ]);
    return NextResponse.json({ items, total, page: q.page, pageSize: q.pageSize });
  } catch (e) {
    return apiError(e);
  }
}
