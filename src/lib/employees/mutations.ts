import "server-only";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/guards";
import { accountMatchKey } from "@/lib/employee-key";
import { ensureDepartment } from "@/lib/departments";
import { findLinkableUserId } from "./link";
import { employeeListSelect } from "./queries";
import type { EmployeeInput, EmployeePatch } from "./schema";

function normalizeNo(v: string): string {
  return v.normalize("NFKC").replace(/\s+/g, "");
}

export async function createEmployee(actor: Actor, input: EmployeeInput) {
  const employeeNo = normalizeNo(input.employeeNo);
  const key = accountMatchKey(employeeNo);
  if (!key) throw new ApiError(400, "invalid_employee_no");
  const dup = await prisma.employee.findUnique({
    where: { employeeKey: key },
    select: { id: true, name: true, employeeNo: true, isActive: true },
  });
  if (dup) throw new ApiError(409, "employee_exists", { employee: dup });

  const dept = await ensureDepartment(prisma, input.departmentName);
  const userId = await findLinkableUserId(prisma, key, employeeNo);
  const created = await prisma.employee.create({
    data: {
      employeeNo,
      employeeKey: key,
      name: input.name,
      departmentId: dept?.id ?? null,
      team: input.team,
      title: input.title,
      email: input.email,
      phone: input.phone,
      note: input.note,
      userId,
    },
    select: employeeListSelect,
  });
  await writeAudit(prisma, actor, {
    action: "employee.create",
    targetType: "employee",
    targetId: created.id,
    after: { employeeNo, name: input.name, department: dept?.name ?? null },
    summary: `新建员工 ${input.name}（${employeeNo}）`,
  });
  return created;
}

export async function updateEmployee(actor: Actor, id: string, patch: EmployeePatch) {
  const existing = await prisma.employee.findUnique({ where: { id }, select: employeeListSelect });
  if (!existing) throw new ApiError(404, "not_found");

  const data: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  if (patch.employeeNo !== undefined) {
    const employeeNo = normalizeNo(patch.employeeNo);
    const key = accountMatchKey(employeeNo);
    if (!key) throw new ApiError(400, "invalid_employee_no");
    if (key !== existing.employeeKey) {
      const dup = await prisma.employee.findUnique({ where: { employeeKey: key }, select: { id: true, name: true } });
      if (dup) throw new ApiError(409, "employee_exists", { employee: dup });
      data.employeeKey = key;
      data.userId = await findLinkableUserId(prisma, key, employeeNo);
    }
    if (employeeNo !== existing.employeeNo) {
      data.employeeNo = employeeNo;
      before.employeeNo = existing.employeeNo;
      after.employeeNo = employeeNo;
    }
  }
  if (patch.departmentName !== undefined) {
    const dept = await ensureDepartment(prisma, patch.departmentName);
    const next = dept?.id ?? null;
    if (next !== (existing.department?.id ?? null)) {
      data.departmentId = next;
      before.department = existing.department?.name ?? null;
      after.department = dept?.name ?? null;
    }
  }
  for (const f of ["name", "team", "title", "email", "phone", "note"] as const) {
    const v = patch[f];
    if (v !== undefined && v !== existing[f]) {
      data[f] = v;
      before[f] = existing[f];
      after[f] = v;
    }
  }
  if (Object.keys(data).length === 0) return existing;

  const updated = await prisma.employee.update({ where: { id }, data, select: employeeListSelect });
  await writeAudit(prisma, actor, {
    action: "employee.update",
    targetType: "employee",
    targetId: id,
    before,
    after,
    summary: `修改员工 ${updated.name}（${updated.employeeNo}）：${Object.keys(after).join("、") || "关联"}`,
  });
  return updated;
}

/** 离职：停用并释放座位。 */
export async function deactivateEmployee(actor: Actor, id: string) {
  const existing = await prisma.employee.findUnique({ where: { id }, select: employeeListSelect });
  if (!existing) throw new ApiError(404, "not_found");
  if (!existing.isActive) return existing;
  const updated = await prisma.$transaction(async (tx) => {
    if (existing.seat) {
      await tx.seat.update({ where: { id: existing.seat.id }, data: { employeeId: null } });
      await writeAudit(tx, actor, {
        action: "seat.release",
        targetType: "seat",
        targetId: existing.seat.id,
        officeId: existing.seat.floor.office.id,
        floorId: existing.seat.floor.id,
        before: { employeeId: existing.id, employeeNo: existing.employeeNo, name: existing.name },
        after: { employeeId: null },
        summary: `${existing.name} 离职，释放座位 ${existing.seat.code}`,
      });
    }
    const row = await tx.employee.update({
      where: { id },
      data: { isActive: false, leftAt: new Date() },
      select: employeeListSelect,
    });
    await writeAudit(tx, actor, {
      action: "employee.deactivate",
      targetType: "employee",
      targetId: id,
      summary: `员工离职 ${existing.name}（${existing.employeeNo}）`,
    });
    return row;
  });
  return updated;
}

export async function reactivateEmployee(actor: Actor, id: string) {
  const existing = await prisma.employee.findUnique({ where: { id }, select: { id: true, isActive: true, name: true, employeeNo: true } });
  if (!existing) throw new ApiError(404, "not_found");
  if (existing.isActive) return prisma.employee.findUniqueOrThrow({ where: { id }, select: employeeListSelect });
  const row = await prisma.employee.update({
    where: { id },
    data: { isActive: true, leftAt: null },
    select: employeeListSelect,
  });
  await writeAudit(prisma, actor, {
    action: "employee.reactivate",
    targetType: "employee",
    targetId: id,
    summary: `员工复职 ${existing.name}（${existing.employeeNo}）`,
  });
  return row;
}
