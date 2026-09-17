import "server-only";
import type { Db } from "@/lib/audit";
import { canonicalAccountText } from "@/lib/employee-key";

/** 花名册工号对应的登录账号（尚未关联别的员工时）。 */
export async function findLinkableUserId(db: Db, key: string, employeeNo: string): Promise<string | null> {
  const candidates = Array.from(new Set([key, canonicalAccountText(employeeNo)]));
  const user = await db.user.findFirst({ where: { huaweiW3Id: { in: candidates }, employee: null }, select: { id: true } });
  return user?.id ?? null;
}
