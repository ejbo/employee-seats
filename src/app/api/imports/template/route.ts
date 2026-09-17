import { z } from "zod";
import { prisma } from "@/lib/db";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError, parseQuery } from "@/lib/api";
import { buildImportTemplate } from "@/lib/import/template";
import { compareSeatCodes } from "@/lib/employee-key";
import { SEAT_STATUS_LABELS } from "@/lib/labels";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { officeId } = parseQuery(req, z.object({ officeId: z.string().min(1) }));
    const gate = await gateApi({ office: officeId, need: "MANAGER" });
    if (!gate.ok) return gate.response;
    const office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true } });
    if (!office) throw new ApiError(404, "not_found");
    const seats = await prisma.seat.findMany({
      where: { officeId },
      select: { code: true, status: true, floor: { select: { name: true, sortOrder: true } }, employee: { select: { name: true } } },
    });
    seats.sort((a, b) => a.floor.sortOrder - b.floor.sortOrder || compareSeatCodes(a.code, b.code));
    const buffer = await buildImportTemplate(
      office,
      seats.map((s) => ({ code: s.code, floorName: s.floor.name, status: SEAT_STATUS_LABELS[s.status], occupant: s.employee?.name ?? null })),
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${office.name}-导入模板.xlsx`)}`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
