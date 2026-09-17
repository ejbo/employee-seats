import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { departmentInputSchema } from "@/lib/offices/schema";
import { paletteColor } from "@/lib/map/colors";

export async function GET() {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const departments = await prisma.department.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { employees: { where: { isActive: true } }, zones: true } } },
    });
    return NextResponse.json({
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        color: d.color,
        sortOrder: d.sortOrder,
        employeeCount: d._count.employees,
        zoneCount: d._count.zones,
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const gate = await gateApi({ role: "ADMIN" });
    if (!gate.ok) return gate.response;
    const input = await parseBody(req, departmentInputSchema);
    const dup = await prisma.department.findUnique({ where: { name: input.name } });
    if (dup) throw new ApiError(409, "department_exists");
    const count = await prisma.department.count();
    const department = await prisma.department.create({
      data: { name: input.name, color: input.color ?? paletteColor(count), sortOrder: input.sortOrder ?? count },
    });
    await writeAudit(prisma, gate.actor, {
      action: "department.create",
      targetType: "department",
      targetId: department.id,
      after: input,
      summary: `新建部门 ${input.name}`,
    });
    return NextResponse.json({ department }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
