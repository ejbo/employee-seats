import { NextResponse } from "next/server";
import { z } from "zod";
import { gateApi } from "@/lib/auth/guards";
import { apiError, parseBody } from "@/lib/api";
import { grantOfficeRole, listOfficeGrants } from "@/lib/permissions-admin";

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ w3Id: z.string().trim().min(1).max(32), role: z.enum(["EDITOR", "MANAGER"]), name: z.string().trim().max(64).optional() });

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi({ office: id, need: "MANAGER" });
    if (!gate.ok) return gate.response;
    return NextResponse.json({ grants: await listOfficeGrants(id), viewer: gate.caps });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const gate = await gateApi({ office: id, need: "MANAGER" });
    if (!gate.ok) return gate.response;
    const body = await parseBody(req, bodySchema);
    const grant = await grantOfficeRole(gate.actor, id, body.w3Id, body.role, body.name);
    return NextResponse.json({ grant });
  } catch (e) {
    return apiError(e);
  }
}
