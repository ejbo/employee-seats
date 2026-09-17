import { NextResponse } from "next/server";
import { z } from "zod";
import { gateApi } from "@/lib/auth/guards";
import { apiError, parseBody } from "@/lib/api";
import { setGlobalRole } from "@/lib/permissions-admin";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const gate = await gateApi({ role: "SUPER_ADMIN" });
    if (!gate.ok) return gate.response;
    const { role } = await parseBody(req, z.object({ role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]) }));
    const user = await setGlobalRole(gate.actor, id, role);
    return NextResponse.json({ user: { id: user.id, role: user.role } });
  } catch (e) {
    return apiError(e);
  }
}
