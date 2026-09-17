import { NextResponse } from "next/server";
import { canDeactivateEmployee, gateApi } from "@/lib/auth/guards";
import { apiError, json } from "@/lib/api";
import { reactivateEmployee } from "@/lib/employees/mutations";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    if (!(await canDeactivateEmployee(gate.actor, null))) return json(403, { error: "forbidden", need: "MANAGER" });
    const employee = await reactivateEmployee(gate.actor, id);
    return NextResponse.json({ employee });
  } catch (e) {
    return apiError(e);
  }
}
