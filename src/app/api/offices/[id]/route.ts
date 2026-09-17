import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi, loadOfficeCapabilities } from "@/lib/auth/guards";
import { ApiError, apiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getOfficeSummary } from "@/lib/offices/queries";
import { officePatchSchema } from "@/lib/offices/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const office = await getOfficeSummary(id);
    if (!office) throw new ApiError(404, "not_found");
    const viewer = await loadOfficeCapabilities(gate.actor, id);
    return NextResponse.json({ office, viewer });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi({ role: "ADMIN" });
    if (!gate.ok) return gate.response;
    const patch = await parseBody(req, officePatchSchema);
    const before = await prisma.office.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "not_found");
    const office = await prisma.office.update({ where: { id }, data: patch });
    await writeAudit(prisma, gate.actor, {
      action: "office.update",
      targetType: "office",
      targetId: id,
      officeId: id,
      before: Object.fromEntries(Object.keys(patch).map((k) => [k, (before as Record<string, unknown>)[k]])),
      after: patch,
      summary: `修改办公室 ${office.name}`,
    });
    return NextResponse.json({ office });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi({ role: "ADMIN" });
    if (!gate.ok) return gate.response;
    const office = await prisma.office.findUnique({ where: { id } });
    if (!office) throw new ApiError(404, "not_found");
    const seated = await prisma.seat.count({ where: { officeId: id, employeeId: { not: null } } });
    if (seated > 0) throw new ApiError(409, "office_has_seated", { seated });
    await prisma.office.delete({ where: { id } });
    await writeAudit(prisma, gate.actor, {
      action: "office.delete",
      targetType: "office",
      targetId: id,
      officeId: id,
      before: { institute: office.institute, city: office.city, name: office.name },
      summary: `删除办公室 ${office.institute} / ${office.city} / ${office.name}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
