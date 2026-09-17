import "server-only";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { newBatchId, writeAuditMany, type AuditEntry } from "@/lib/audit";
import type { Actor } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/permissions";

const seatSelect = {
  id: true,
  code: true,
  floorId: true,
  officeId: true,
  status: true,
  employeeId: true,
  employee: { select: { id: true, name: true, employeeNo: true } },
  floor: { select: { name: true } },
} as const;

export interface AssignOptions {
  /** 员工已在别处落座时允许移动过来 */
  allowMove?: boolean;
  /** 目标座位有人时允许把对方移出（对方变为未落座） */
  allowReplace?: boolean;
}

/** 把员工分配到座位（含移动 / 挤位），一个事务 + 审计。 */
export async function assignSeat(actor: Actor, seatId: string, employeeId: string, opts: AssignOptions = {}) {
  return prisma.$transaction(async (tx) => {
    const seat = await tx.seat.findUnique({ where: { id: seatId }, select: seatSelect });
    if (!seat) throw new ApiError(404, "not_found");
    if (seat.status !== "ACTIVE") throw new ApiError(409, "seat_not_assignable", { status: seat.status });
    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, employeeNo: true, isActive: true, seat: { select: seatSelect } },
    });
    if (!employee) throw new ApiError(404, "employee_not_found");
    if (!employee.isActive) throw new ApiError(409, "employee_inactive");
    if (seat.employeeId === employee.id) return { seat, released: [] as { id: string; name: string; employeeNo: string }[] };

    const batchId = newBatchId();
    const entries: AuditEntry[] = [];
    const released: { id: string; name: string; employeeNo: string }[] = [];

    if (seat.employeeId && seat.employee) {
      if (!opts.allowReplace) throw new ApiError(409, "seat_occupied", { occupant: seat.employee });
      await tx.seat.update({ where: { id: seat.id }, data: { employeeId: null } });
      released.push(seat.employee);
      entries.push({
        action: "seat.release",
        targetType: "seat",
        targetId: seat.id,
        officeId: seat.officeId,
        floorId: seat.floorId,
        before: { employeeId: seat.employee.id, name: seat.employee.name, employeeNo: seat.employee.employeeNo },
        after: { employeeId: null },
        summary: `${seat.employee.name} 被移出座位 ${seat.code}（由 ${employee.name} 接替）`,
        batchId,
      });
    }

    const from = employee.seat;
    if (from) {
      if (!opts.allowMove) throw new ApiError(409, "employee_seated", { seat: { id: from.id, code: from.code, floorName: from.floor.name } });
      if (from.officeId !== seat.officeId && !isAdmin(actor.role)) throw new ApiError(403, "cross_office_move_forbidden");
      await tx.seat.update({ where: { id: from.id }, data: { employeeId: null } });
    }

    const updated = await tx.seat.update({ where: { id: seat.id }, data: { employeeId: employee.id }, select: seatSelect });
    entries.push({
      action: from ? "seat.move" : "seat.assign",
      targetType: "seat",
      targetId: seat.id,
      officeId: seat.officeId,
      floorId: seat.floorId,
      before: { employeeId: seat.employeeId, fromSeat: from ? { id: from.id, code: from.code, floorName: from.floor.name } : null },
      after: { employeeId: employee.id, name: employee.name, employeeNo: employee.employeeNo },
      summary: from ? `${employee.name} 从 ${from.floor.name} ${from.code} 移到 ${seat.floor.name} ${seat.code}` : `${employee.name} 落座 ${seat.floor.name} ${seat.code}`,
      batchId,
    });
    await writeAuditMany(tx, actor, entries);
    return { seat: updated, released };
  });
}

export async function releaseSeat(actor: Actor, seatId: string) {
  return prisma.$transaction(async (tx) => {
    const seat = await tx.seat.findUnique({ where: { id: seatId }, select: seatSelect });
    if (!seat) throw new ApiError(404, "not_found");
    if (!seat.employeeId || !seat.employee) return { seat };
    const updated = await tx.seat.update({ where: { id: seat.id }, data: { employeeId: null }, select: seatSelect });
    await writeAuditMany(tx, actor, [
      {
        action: "seat.release",
        targetType: "seat",
        targetId: seat.id,
        officeId: seat.officeId,
        floorId: seat.floorId,
        before: { employeeId: seat.employee.id, name: seat.employee.name, employeeNo: seat.employee.employeeNo },
        after: { employeeId: null },
        summary: `${seat.employee.name} 离开座位 ${seat.floor.name} ${seat.code}`,
      },
    ]);
    return { seat: updated };
  });
}

/** 交换两个座位的占用者（任一为空时等同移动）。 */
export async function swapSeats(actor: Actor, seatId: string, otherSeatId: string) {
  if (seatId === otherSeatId) throw new ApiError(400, "same_seat");
  return prisma.$transaction(async (tx) => {
    const a = await tx.seat.findUnique({ where: { id: seatId }, select: seatSelect });
    const b = await tx.seat.findUnique({ where: { id: otherSeatId }, select: seatSelect });
    if (!a || !b) throw new ApiError(404, "not_found");
    if (a.status !== "ACTIVE" || b.status !== "ACTIVE") throw new ApiError(409, "seat_not_assignable");
    if (a.officeId !== b.officeId && !isAdmin(actor.role)) throw new ApiError(403, "cross_office_move_forbidden");
    if (!a.employeeId && !b.employeeId) return { seats: [a, b] };
    const batchId = newBatchId();
    // 先清空再写入，绕开 employeeId 唯一约束
    await tx.seat.update({ where: { id: a.id }, data: { employeeId: null } });
    await tx.seat.update({ where: { id: b.id }, data: { employeeId: null } });
    const a2 = await tx.seat.update({ where: { id: a.id }, data: { employeeId: b.employeeId }, select: seatSelect });
    const b2 = await tx.seat.update({ where: { id: b.id }, data: { employeeId: a.employeeId }, select: seatSelect });
    const desc = (s: typeof a) => `${s.floor.name} ${s.code}`;
    const entries: AuditEntry[] = [];
    if (a.employee) {
      entries.push({
        action: "seat.move",
        targetType: "seat",
        targetId: b.id,
        officeId: b.officeId,
        floorId: b.floorId,
        before: { employeeId: b.employeeId },
        after: { employeeId: a.employee.id, name: a.employee.name, employeeNo: a.employee.employeeNo },
        summary: `${a.employee.name} 从 ${desc(a)} ${b.employee ? "交换" : "移"}到 ${desc(b)}`,
        batchId,
      });
    }
    if (b.employee) {
      entries.push({
        action: "seat.move",
        targetType: "seat",
        targetId: a.id,
        officeId: a.officeId,
        floorId: a.floorId,
        before: { employeeId: a.employeeId },
        after: { employeeId: b.employee.id, name: b.employee.name, employeeNo: b.employee.employeeNo },
        summary: `${b.employee.name} 从 ${desc(b)} ${a.employee ? "交换" : "移"}到 ${desc(a)}`,
        batchId,
      });
    }
    await writeAuditMany(tx, actor, entries);
    return { seats: [a2, b2] };
  });
}
