import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/auth/guards";
import { apiError, json } from "@/lib/api";

export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return json(401, { error: "unauthenticated" });
    const grants = await prisma.officePermission.findMany({
      where: { userId: actor.id },
      select: { officeId: true, role: true },
    });
    return NextResponse.json({ user: actor, grants });
  } catch (e) {
    return apiError(e);
  }
}
