import "server-only";
import { Prisma, type Department } from "@prisma/client";
import type { Db } from "@/lib/audit";
import { paletteColor } from "@/lib/map/colors";

/** 按名称取部门，不存在则创建（颜色按调色板顺序分配）。空名 → null。 */
export async function ensureDepartment(db: Db, name: string | null | undefined): Promise<Department | null> {
  const n = (name ?? "").normalize("NFKC").trim();
  if (!n) return null;
  const existing = await db.department.findUnique({ where: { name: n } });
  if (existing) return existing;
  const count = await db.department.count();
  try {
    return await db.department.create({ data: { name: n, color: paletteColor(count), sortOrder: count } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return db.department.findUnique({ where: { name: n } });
    }
    throw e;
  }
}
