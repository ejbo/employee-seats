import "server-only";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/guards";
import { accountMatchKey, canonicalAccountText } from "@/lib/employee-key";
import { isAdmin, type GlobalRole, type OfficeRole } from "@/lib/permissions";
import { OFFICE_ROLE_LABELS, ROLE_LABELS } from "@/lib/labels";

export const grantSelect = {
  userId: true,
  officeId: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, huaweiW3Id: true, displayName: true, role: true, lastLoginAt: true, employee: { select: { name: true, department: { select: { name: true } } } } } },
  grantedBy: { select: { displayName: true } },
} as const;

export async function listOfficeGrants(officeId: string) {
  return prisma.officePermission.findMany({ where: { officeId }, select: grantSelect, orderBy: [{ role: "desc" }, { createdAt: "asc" }] });
}

/** 按工号找登录账号；没登录过的人先建一个占位账号（首次 SSO 登录时会补全姓名）。 */
export async function findOrCreateUserByW3Id(w3Id: string, name?: string) {
  const key = accountMatchKey(w3Id);
  if (!key) throw new ApiError(400, "invalid_employee_no");
  const candidates = Array.from(new Set([key, canonicalAccountText(w3Id)]));
  const existing = await prisma.user.findFirst({ where: { huaweiW3Id: { in: candidates } } });
  if (existing) return existing;
  const employee = await prisma.employee.findUnique({ where: { employeeKey: key }, select: { id: true, name: true, userId: true } });
  const display = name?.trim() || employee?.name || key;
  const user = await prisma.user.create({ data: { huaweiW3Id: key, huaweiW3Name: display, displayName: display, role: "USER" } });
  if (employee && !employee.userId) await prisma.employee.update({ where: { id: employee.id }, data: { userId: user.id } });
  return user;
}

export async function grantOfficeRole(actor: Actor, officeId: string, w3Id: string, role: OfficeRole, name?: string) {
  if (role === "MANAGER" && !isAdmin(actor.role)) throw new ApiError(403, "forbidden", { need: "ADMIN" });
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true } });
  if (!office) throw new ApiError(404, "not_found");
  const user = await findOrCreateUserByW3Id(w3Id, name);
  const before = await prisma.officePermission.findUnique({ where: { userId_officeId: { userId: user.id, officeId } } });
  const grant = await prisma.officePermission.upsert({
    where: { userId_officeId: { userId: user.id, officeId } },
    update: { role, grantedById: actor.id },
    create: { userId: user.id, officeId, role, grantedById: actor.id },
    select: grantSelect,
  });
  await writeAudit(prisma, actor, {
    action: "permission.grant",
    targetType: "user",
    targetId: user.id,
    officeId,
    before: before ? { role: before.role } : null,
    after: { role },
    summary: `授予 ${user.displayName}（${user.huaweiW3Id}）${office.name} 的「${OFFICE_ROLE_LABELS[role]}」`,
  });
  return grant;
}

export async function revokeOfficeRole(actor: Actor, officeId: string, userId: string) {
  const existing = await prisma.officePermission.findUnique({ where: { userId_officeId: { userId, officeId } }, select: grantSelect });
  if (!existing) throw new ApiError(404, "not_found");
  if (existing.role === "MANAGER" && !isAdmin(actor.role)) throw new ApiError(403, "forbidden", { need: "ADMIN" });
  await prisma.officePermission.delete({ where: { userId_officeId: { userId, officeId } } });
  await writeAudit(prisma, actor, {
    action: "permission.revoke",
    targetType: "user",
    targetId: userId,
    officeId,
    before: { role: existing.role },
    summary: `撤销 ${existing.user.displayName}（${existing.user.huaweiW3Id}）的「${OFFICE_ROLE_LABELS[existing.role]}」`,
  });
}

export async function setGlobalRole(actor: Actor, userId: string, role: GlobalRole) {
  if (userId === actor.id) throw new ApiError(400, "cannot_change_self");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, displayName: true, huaweiW3Id: true } });
  if (!target) throw new ApiError(404, "not_found");
  if (target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
    const supers = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
    if (supers <= 1) throw new ApiError(409, "last_super_admin");
  }
  const user = await prisma.user.update({ where: { id: userId }, data: { role } });
  await writeAudit(prisma, actor, {
    action: "user.role",
    targetType: "user",
    targetId: userId,
    before: { role: target.role },
    after: { role },
    summary: `${target.displayName}（${target.huaweiW3Id}）角色由「${ROLE_LABELS[target.role]}」改为「${ROLE_LABELS[role]}」`,
  });
  return user;
}
