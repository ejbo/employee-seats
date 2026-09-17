import { NextResponse } from "next/server";
import { canManageEmployees, gateApi } from "@/lib/auth/guards";
import { apiError, json, parseBody, parseQuery } from "@/lib/api";
import { employeeInputSchema, employeeQuerySchema } from "@/lib/employees/schema";
import { searchEmployees } from "@/lib/employees/queries";
import { createEmployee } from "@/lib/employees/mutations";

export async function GET(req: Request) {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const q = parseQuery(req, employeeQuerySchema);
    const result = await searchEmployees(q);
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    if (!(await canManageEmployees(gate.actor))) return json(403, { error: "forbidden", need: "EDITOR" });
    const input = await parseBody(req, employeeInputSchema);
    const employee = await createEmployee(gate.actor, input);
    return NextResponse.json({ employee }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
