import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { gateApi } from "@/lib/auth/guards";
import { apiError, parseBody } from "@/lib/api";
import { runImport } from "@/lib/import/apply";

const rowSchema = z.object({
  rowNo: z.number().int().min(1),
  seatCode: z.string().max(64).default(""),
  employeeNo: z.string().max(64).default(""),
  name: z.string().max(64).default(""),
  department: z.string().max(64).default(""),
  team: z.string().max(64).default(""),
  title: z.string().max(64).default(""),
  email: z.string().max(128).default(""),
  phone: z.string().max(32).default(""),
  note: z.string().max(500).default(""),
  floor: z.string().max(32).default(""),
  status: z.string().max(32).default(""),
});

const bodySchema = z.object({
  officeId: z.string().min(1),
  mode: z.enum(["merge", "replace"]),
  rows: z.array(rowSchema).min(1).max(env.MAX_IMPORT_ROWS),
  expectedHash: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, bodySchema);
    const gate = await gateApi({ office: body.officeId, need: "MANAGER" });
    if (!gate.ok) return gate.response;
    const result = await runImport(gate.actor, body);
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}
