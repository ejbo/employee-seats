import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { gateApi } from "@/lib/auth/guards";
import { ApiError, apiError } from "@/lib/api";
import { IMAGE_TYPES, saveUpload } from "@/lib/files/storage";

export const runtime = "nodejs";

/** 上传楼层底图（只存文件，backgroundKey 由编辑器通过布局保存写入）。 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const floor = await prisma.floor.findUnique({ where: { id }, select: { officeId: true } });
    if (!floor) throw new ApiError(404, "not_found");
    const gate = await gateApi({ office: floor.officeId, need: "MANAGER" });
    if (!gate.ok) return gate.response;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "invalid_input", { message: "缺少文件" });
    const ext = IMAGE_TYPES[file.type];
    if (!ext) throw new ApiError(400, "unsupported_file", { message: "仅支持 PNG / JPG / WebP" });
    const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
    if (file.size > maxBytes) throw new ApiError(413, "file_too_large", { maxMb: env.MAX_UPLOAD_MB });
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = await saveUpload(buffer, { dir: `floors/${id}`, ext });
    return NextResponse.json({ backgroundKey: key, url: `/api/files/${key}` }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
