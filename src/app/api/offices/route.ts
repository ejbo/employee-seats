import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { apiError, parseBody } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { listOfficesWithStats } from "@/lib/offices/queries";
import { officeInputSchema } from "@/lib/offices/schema";

export async function GET() {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const offices = await listOfficesWithStats();
    return NextResponse.json({ offices });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const gate = await gateApi({ role: "ADMIN" });
    if (!gate.ok) return gate.response;
    const input = await parseBody(req, officeInputSchema);
    const office = await prisma.office.create({ data: { ...input, createdById: gate.actor.id } });
    await writeAudit(prisma, gate.actor, {
      action: "office.create",
      targetType: "office",
      targetId: office.id,
      officeId: office.id,
      after: input,
      summary: `新建办公室 ${input.institute} / ${input.city} / ${input.name}`,
    });
    return NextResponse.json({ office }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
