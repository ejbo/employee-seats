import { Readable } from "node:stream";
import { gateApi } from "@/lib/auth/guards";
import { apiError, json } from "@/lib/api";
import { openFile } from "@/lib/files/storage";

export const runtime = "nodejs";

/** 受登录保护的文件读取（底图等）。 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const gate = await gateApi();
    if (!gate.ok) return gate.response;
    const { key } = await params;
    const file = await openFile(key.join("/"));
    if (!file) return json(404, { error: "not_found" });
    return new Response(Readable.toWeb(file.stream as Readable) as ReadableStream, {
      headers: {
        "content-type": file.contentType,
        "content-length": String(file.size),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
