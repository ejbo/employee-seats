import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi, loadOfficeCapabilities } from "@/lib/auth/guards";
import { loadFloorPageData } from "@/lib/floors/scene";
import { ApiError, apiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { floorPatchSchema } from "@/lib/offices/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const before = await prisma.floor.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "not_found");
    const gate = await gateApi({ office: before.officeId, need: "MANAGER" });
    if (!gate.ok) return gate.response;
    const patch = await parseBody(req, floorPatchSchema);
    if (patch.name && patch.name !== before.name) {
      const dup = await prisma.floor.findUnique({ where: { officeId_name: { officeId: before.officeId, name: patch.name } } });
      if (dup) throw new ApiError(409, "floor_exists");
    }
    const floor = await prisma.floor.update({ where: { id }, data: patch });
    await writeAudit(prisma, gate.actor, {
      action: "floor.update",
      targetType: "floor",
      targetId: id,
      officeId: before.officeId,
      floorId: id,
      before: Object.fromEntries(Object.keys(patch).map((k) => [k, (before as Record<string, unknown>)[k]])),
      after: patch,
      summary: `修改楼层 ${floor.name}`,
    });
    return NextResponse.json({ floor });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const floor = await prisma.floor.findUnique({ where: { id } });
    if (!floor) throw new ApiError(404, "not_found");
    const gate = await gateApi({ role: "ADMIN" });
    if (!gate.ok) return gate.response;
    const seated = await prisma.seat.count({ where: { floorId: id, employeeId: { not: null } } });
    if (seated > 0) throw new ApiError(409, "floor_has_seated", { seated });
    await prisma.floor.delete({ where: { id } });
    await writeAudit(prisma, gate.actor, {
      action: "floor.delete",
      targetType: "floor",
      targetId: id,
      officeId: floor.officeId,
      floorId: id,
      before: { name: floor.name },
      summary: `删除楼层 ${floor.name}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const data = await loadFloorPageData(id);
    if (!data) throw new ApiError(404, "not_found");
    const viewer = await loadOfficeCapabilities(gate.actor, data.office.id);
    return NextResponse.json({ ...data, viewer });
  } catch (e) {
    return apiError(e);
  }
}
