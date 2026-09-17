import "server-only";
import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { accountMatchKey } from "@/lib/employee-key";

/** 登录提供方（华为 SSO / 开发登录）交给我们的身份信息。 */
export interface SsoProfile {
  /** 工号（W3 uid）。唯一被信任的身份键。 */
  uid: string;
  nameCn?: string;
  nameEn?: string;
  email?: string;
  employeeType?: string;
  phone?: string;
  /** userinfo 原始载荷，首次登录时整包保存，便于日后发现租户额外返回的字段。 */
  raw?: Record<string, unknown>;
}

let superAdminKeys: Set<string> | null = null;
function isBootstrapSuperAdmin(w3Id: string): boolean {
  if (!superAdminKeys) {
    superAdminKeys = new Set(
      env.SUPER_ADMIN_W3_IDS.map((v) => accountMatchKey(v)).filter((k): k is string => Boolean(k)),
    );
  }
  const key = accountMatchKey(w3Id);
  return Boolean(key && superAdminKeys.has(key));
}

/**
 * 首次登录建档 / 再次登录更新。幂等：OAuth 回调可能几乎同时触发两次
 * （双击、第二个标签页、网关预取），创建撞唯一索引时以数据库为准重读。
 *
 * 不从 SSO 自动创建 Employee（花名册）记录：SSO 没有部门/地点，凭空建一条
 * 只会用路人污染花名册。花名册由导入/手工维护，登录时按工号把账号挂上去。
 */
export async function provisionSsoUser(p: SsoProfile): Promise<User> {
  const w3Id = p.uid.trim();
  if (!w3Id) throw new Error("SSO profile has no uid");
  const now = new Date();
  const name = (p.nameCn || p.nameEn || w3Id).trim();
  const promote = isBootstrapSuperAdmin(w3Id);

  const existing = await prisma.user.findUnique({ where: { huaweiW3Id: w3Id } });
  let user: User;
  if (existing) {
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        lastLoginAt: now,
        ...(p.email ? { email: p.email } : {}),
        ...(p.phone ? { phone: p.phone } : {}),
        ...(p.employeeType ? { employeeType: p.employeeType } : {}),
        // W3 姓名只写一次，之后不再改动（displayName 才是可编辑的）。
        // 例外：被提前授权、从未登录过的占位账号，首次登录时用 SSO 的姓名补全。
        ...(existing.huaweiW3Name && existing.lastLoginAt ? {} : { huaweiW3Name: name, displayName: existing.lastLoginAt ? existing.displayName : name }),
        ...(promote && existing.role !== "SUPER_ADMIN" ? { role: "SUPER_ADMIN" as const } : {}),
      },
    });
  } else {
    try {
      user = await prisma.user.create({
        data: {
          huaweiW3Id: w3Id,
          huaweiW3Name: name,
          displayName: name,
          email: p.email || null,
          phone: p.phone || null,
          employeeType: p.employeeType || null,
          rawProfile: (p.raw ?? undefined) as Prisma.InputJsonValue | undefined,
          role: promote ? "SUPER_ADMIN" : "USER",
          lastLoginAt: now,
        },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      // 并发回调已经创建了这条记录：以它为准。
      user = await prisma.user.update({ where: { huaweiW3Id: w3Id }, data: { lastLoginAt: now } });
    }
  }

  await linkEmployeeToUser(user.id, w3Id);
  return user;
}

/** 把花名册里同工号、尚未关联账号的员工挂到这个账号上（尽力而为，绝不阻断登录）。 */
export async function linkEmployeeToUser(userId: string, w3Id: string): Promise<void> {
  const key = accountMatchKey(w3Id);
  if (!key) return;
  try {
    await prisma.employee.updateMany({ where: { employeeKey: key, userId: null }, data: { userId } });
  } catch (e) {
    console.warn("[auth] link employee failed", e);
  }
}
