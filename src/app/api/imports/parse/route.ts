import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError } from "@/lib/api";
import { isAdmin } from "@/lib/permissions";
import { parsePastedTable, parseUpload, type ParseResult } from "@/lib/import/parse";
import { computeImportDiff, type ImportMode } from "@/lib/import/diff";
import { loadImportSnapshot } from "@/lib/import/apply";

export const runtime = "nodejs";

/** 上传（或粘贴）→ 解析 → 与当前数据比对 → 预览。 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const officeId = String(form.get("officeId") ?? "");
    const mode: ImportMode = form.get("mode") === "replace" ? "replace" : "merge";
    if (!officeId) throw new ApiError(400, "invalid_input", { message: "缺少 officeId" });
    const gate = await gateApi({ office: officeId, need: "MANAGER" });
    if (!gate.ok) return gate.response;
    const office = await prisma.office.findUnique({ where: { id: officeId }, select: { id: true } });
    if (!office) throw new ApiError(404, "not_found");

    const file = form.get("file");
    const text = form.get("text");
    let parsed: ParseResult;
    if (file instanceof File && file.size > 0) {
      if (file.size > env.MAX_UPLOAD_MB * 1024 * 1024) throw new ApiError(413, "file_too_large", { maxMb: env.MAX_UPLOAD_MB });
      try {
        parsed = await parseUpload(file.name, new Uint8Array(await file.arrayBuffer()));
      } catch (e) {
        throw new ApiError(400, "unsupported_file", { message: e instanceof Error ? e.message : String(e) });
      }
    } else if (typeof text === "string" && text.trim()) {
      parsed = parsePastedTable(text);
    } else throw new ApiError(400, "invalid_input", { message: "缺少文件或文本" });

    if (parsed.rows.length === 0) throw new ApiError(400, "no_rows", { matched: parsed.matched, unknownHeaders: parsed.unknownHeaders });
    if (parsed.rows.length > env.MAX_IMPORT_ROWS) throw new ApiError(413, "too_many_rows", { max: env.MAX_IMPORT_ROWS });

    const snapshot = await loadImportSnapshot(prisma, officeId);
    const diff = computeImportDiff({ rows: parsed.rows, mode, snapshot, actorIsAdmin: isAdmin(gate.actor.role) });
    return NextResponse.json({ officeId, mode, rows: parsed.rows, matched: parsed.matched, unknownHeaders: parsed.unknownHeaders, diff });
  } catch (e) {
    return apiError(e);
  }
}
