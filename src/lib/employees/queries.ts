import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { EmployeeQuery } from "./schema";

export const employeeListSelect = {
  id: true,
  employeeNo: true,
  employeeKey: true,
  name: true,
  team: true,
  title: true,
  email: true,
  phone: true,
  note: true,
  isActive: true,
  leftAt: true,
  userId: true,
  updatedAt: true,
  department: { select: { id: true, name: true, color: true } },
  seat: {
    select: {
      id: true,
      code: true,
      floor: { select: { id: true, name: true, office: { select: { id: true, name: true, city: true } } } },
    },
  },
} satisfies Prisma.EmployeeSelect;

export type EmployeeListItem = Prisma.EmployeeGetPayload<{ select: typeof employeeListSelect }>;

export async function searchEmployees(q: EmployeeQuery) {
  const where: Prisma.EmployeeWhereInput = {};
  if (q.active !== "all") where.isActive = q.active !== "0";
  if (q.departmentId) where.departmentId = q.departmentId;
  if (q.unassigned === "1") where.seat = null;
  if (q.officeId) {
    // 该办公室的落座员工，或（未落座筛选下）任意未落座员工
    where.seat = q.unassigned === "1" ? null : { officeId: q.officeId };
  }
  if (q.q) {
    const term = q.q.replace(/\s+/g, "");
    const digits = term.replace(/\D+/g, "");
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { employeeNo: { contains: term, mode: "insensitive" } },
      ...(digits ? [{ employeeKey: { contains: digits } }] : []),
      { email: { contains: term, mode: "insensitive" } },
    ];
  }
  const [total, items] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      select: employeeListSelect,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}
