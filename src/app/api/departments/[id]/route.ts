import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { departmentPatchSchema } from "@/lib/offices/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi({ role: "ADMIN" });
    if (!gate.ok) return gate.response;
    const patch = await parseBody(req, departmentPatchSchema);
    const before = await prisma.department.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "not_found");
    if (patch.name && patch.name !== before.name) {
      const dup = await prisma.department.findUnique({ where: { name: patch.name } });
      if (dup) throw new ApiError(409, "department_exists");
    }
    const department = await prisma.department.update({ where: { id }, data: patch });
    await writeAudit(prisma, gate.actor, {
      action: "department.update",
      targetType: "department",
      targetId: id,
      before: { name: before.name, color: before.color },
      after: patch,
      summary: `修改部门 ${department.name}`,
    });
    return NextResponse.json({ department });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi({ role: "ADMIN" });
    if (!gate.ok) return gate.response;
    const before = await prisma.department.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "not_found");
    await prisma.department.delete({ where: { id } });
    await writeAudit(prisma, gate.actor, {
      action: "department.delete",
      targetType: "department",
      targetId: id,
      before: { name: before.name },
      summary: `删除部门 ${before.name}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
