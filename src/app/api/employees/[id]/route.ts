import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageEmployees, gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, json, parseBody } from "@/lib/api";
import { employeePatchSchema } from "@/lib/employees/schema";
import { employeeListSelect } from "@/lib/employees/queries";
import { updateEmployee } from "@/lib/employees/mutations";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const employee = await prisma.employee.findUnique({ where: { id }, select: employeeListSelect });
    if (!employee) throw new ApiError(404, "not_found");
    return NextResponse.json({ employee });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    if (!(await canManageEmployees(gate.actor))) return json(403, { error: "forbidden", need: "EDITOR" });
    const patch = await parseBody(req, employeePatchSchema);
    const employee = await updateEmployee(gate.actor, id, patch);
    return NextResponse.json({ employee });
  } catch (e) {
    return apiError(e);
  }
}
