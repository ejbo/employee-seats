import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

// turbopackIgnore：这里的路径是运行时配置，不要让构建追踪整个工程目录
const ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), env.UPLOAD_DIR);

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function contentTypeFor(key: string): string {
  const ext = path.extname(key).toLowerCase();
  return (
    { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" }[ext] ??
    "application/octet-stream"
  );
}

/** 把 key 解析成 UPLOAD_DIR 内的绝对路径；越界 → null。 */
export function resolveKey(key: string): string | null {
  if (!key || key.includes("\0")) return null;
  const abs = path.resolve(/* turbopackIgnore: true */ ROOT, key);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

export async function saveUpload(buffer: Buffer, opts: { dir: string; ext: string }): Promise<string> {
  const key = path.posix.join(opts.dir, `${crypto.randomUUID()}.${opts.ext}`);
  const abs = resolveKey(key);
  if (!abs) throw new Error("invalid upload path");
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return key;
}

export async function openFile(key: string): Promise<{ stream: NodeJS.ReadableStream; size: number; contentType: string } | null> {
  const abs = resolveKey(key);
  if (!abs) return null;
  try {
    const st = await stat(abs);
    if (!st.isFile()) return null;
    return { stream: createReadStream(abs), size: st.size, contentType: contentTypeFor(key) };
  } catch {
    return null;
  }
}
