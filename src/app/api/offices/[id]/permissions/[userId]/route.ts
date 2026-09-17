import { NextResponse } from "next/server";
import { gateApi } from "@/lib/auth/guards";
import { apiError } from "@/lib/api";
import { revokeOfficeRole } from "@/lib/permissions-admin";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { id, userId } = await params;
    const gate = await gateApi({ office: id, need: "MANAGER" });
    if (!gate.ok) return gate.response;
    await revokeOfficeRole(gate.actor, id, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
