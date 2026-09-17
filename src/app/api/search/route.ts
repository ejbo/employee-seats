import { NextResponse } from "next/server";
import { z } from "zod";
import { gateApi } from "@/lib/auth/guards";
import { apiError, parseQuery } from "@/lib/api";
import { globalSearch } from "@/lib/search";

const querySchema = z.object({ q: z.string().trim().max(64).default("") });

export async function GET(req: Request) {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const { q } = parseQuery(req, querySchema);
    return NextResponse.json(await globalSearch(q));
  } catch (e) {
    return apiError(e);
  }
}
