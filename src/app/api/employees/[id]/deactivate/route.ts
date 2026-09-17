import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canDeactivateEmployee, gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, json } from "@/lib/api";
import { deactivateEmployee } from "@/lib/employees/mutations";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const row = await prisma.employee.findUnique({ where: { id }, select: { seat: { select: { officeId: true } } } });
    if (!row) throw new ApiError(404, "not_found");
    if (!(await canDeactivateEmployee(gate.actor, row.seat?.officeId ?? null))) {
      return json(403, { error: "forbidden", need: "MANAGER" });
    }
    const employee = await deactivateEmployee(gate.actor, id);
    return NextResponse.json({ employee });
  } catch (e) {
    return apiError(e);
  }
}
