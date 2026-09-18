import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { newBatchId, writeAuditMany, type AuditEntry } from "@/lib/audit";
import type { Actor } from "@/lib/auth/guards";
import { normalizeSeatCode } from "@/lib/employee-key";
import type { LayoutSaveBody } from "./ops-schema";

export interface LayoutSaveResult {
  version: number;
  counts: {
    seatsCreated: number;
    seatsUpdated: number;
    seatsDeleted: number;
    zonesUpserted: number;
    zonesDeleted: number;
    decor: boolean;
    floor: boolean;
  };
}

/**
 * 应用一批布局操作。乐观锁：baseVersion 必须等于当前 version，否则 409 version_conflict。
 * 有人的座位不能删除；座位编号在楼层内唯一；把有人的座位改为预留/停用会自动释放并记审计。
 */
export async function saveLayout(actor: Actor, floorId: string, body: LayoutSaveBody): Promise<LayoutSaveResult> {
  return prisma.$transaction(async (tx) => {
    const floor = await tx.floor.findUnique({ where: { id: floorId }, select: { id: true, officeId: true, version: true, name: true } });
    if (!floor) throw new ApiError(404, "not_found");
    const bump = await tx.floor.updateMany({ where: { id: floorId, version: body.baseVersion }, data: { version: { increment: 1 } } });
    if (bump.count === 0) throw new ApiError(409, "version_conflict", { currentVersion: floor.version });

    const batchId = newBatchId();
    const entries: AuditEntry[] = [];
    const counts: LayoutSaveResult["counts"] = {
      seatsCreated: 0,
      seatsUpdated: 0,
      seatsDeleted: 0,
      zonesUpserted: 0,
      zonesDeleted: 0,
      decor: false,
      floor: false,
    };

    for (const op of body.ops) {
      switch (op.type) {
        case "seat.upsert": {
          const code = normalizeSeatCode(op.seat.code);
          if (!code) throw new ApiError(400, "invalid_input", { message: "座位编号不能为空" });
          const existing = await tx.seat.findUnique({
            where: { id: op.seat.id },
            select: { id: true, floorId: true, code: true, employeeId: true, employee: { select: { name: true, employeeNo: true } } },
          });
          if (existing && existing.floorId !== floorId) throw new ApiError(400, "invalid_input", { message: "座位不属于本楼层" });
          const dup = await tx.seat.findFirst({ where: { floorId, code, NOT: { id: op.seat.id } }, select: { id: true } });
          if (dup) throw new ApiError(409, "seat_code_taken", { code });
          let zoneId = op.seat.zoneId;
          if (zoneId) {
            const z = await tx.zone.findUnique({ where: { id: zoneId }, select: { floorId: true } });
            if (!z || z.floorId !== floorId) zoneId = null;
          }
          const data = {
            code,
            x: op.seat.x,
            y: op.seat.y,
            w: op.seat.w,
            h: op.seat.h,
            rotation: op.seat.rotation,
            zoneId,
            status: op.seat.status,
            note: op.seat.note,
            style: op.seat.style,
          };
          if (existing) {
            const releasing = op.seat.status !== "ACTIVE" && existing.employeeId;
            await tx.seat.update({ where: { id: existing.id }, data: { ...data, ...(releasing ? { employeeId: null } : {}) } });
            counts.seatsUpdated += 1;
            if (releasing && existing.employee) {
              entries.push({
                action: "seat.release",
                targetType: "seat",
                targetId: existing.id,
                officeId: floor.officeId,
                floorId,
                before: { employeeId: existing.employeeId, name: existing.employee.name, employeeNo: existing.employee.employeeNo },
                after: { employeeId: null, status: op.seat.status },
                summary: `座位 ${code} 改为${op.seat.status === "RESERVED" ? "预留" : "停用"}，${existing.employee.name} 变为未落座`,
                batchId,
              });
            }
          } else {
            await tx.seat.create({ data: { id: op.seat.id, floorId, officeId: floor.officeId, ...data } });
            counts.seatsCreated += 1;
          }
          break;
        }
        case "seat.delete": {
          const existing = await tx.seat.findUnique({ where: { id: op.id }, select: { id: true, floorId: true, code: true, employeeId: true } });
          if (!existing || existing.floorId !== floorId) break;
          if (existing.employeeId) throw new ApiError(409, "seat_occupied", { code: existing.code });
          await tx.seat.delete({ where: { id: existing.id } });
          counts.seatsDeleted += 1;
          break;
        }
        case "zone.upsert": {
          const existing = await tx.zone.findUnique({ where: { id: op.zone.id }, select: { id: true, floorId: true } });
          if (existing && existing.floorId !== floorId) throw new ApiError(400, "invalid_input", { message: "区域不属于本楼层" });
          const data = {
            name: op.zone.name,
            departmentId: op.zone.departmentId,
            color: op.zone.color,
            geometry: op.zone.geometry as unknown as Prisma.InputJsonValue,
            sortOrder: op.zone.sortOrder,
          };
          if (existing) await tx.zone.update({ where: { id: existing.id }, data });
          else await tx.zone.create({ data: { id: op.zone.id, floorId, ...data } });
          counts.zonesUpserted += 1;
          break;
        }
        case "zone.delete": {
          const existing = await tx.zone.findUnique({ where: { id: op.id }, select: { id: true, floorId: true } });
          if (!existing || existing.floorId !== floorId) break;
          await tx.zone.delete({ where: { id: existing.id } });
          counts.zonesDeleted += 1;
          break;
        }
        case "decor.set": {
          await tx.floor.update({ where: { id: floorId }, data: { decor: op.decor as unknown as Prisma.InputJsonValue } });
          counts.decor = true;
          break;
        }
        case "floor.patch": {
          await tx.floor.update({ where: { id: floorId }, data: op.patch });
          counts.floor = true;
          break;
        }
      }
    }

    entries.push({
      action: "layout.save",
      targetType: "floor",
      targetId: floorId,
      officeId: floor.officeId,
      floorId,
      after: counts,
      summary: `保存楼层 ${floor.name} 布局：座位 +${counts.seatsCreated} ~${counts.seatsUpdated} -${counts.seatsDeleted}，区域 ~${counts.zonesUpserted} -${counts.zonesDeleted}${counts.decor ? "，装饰已更新" : ""}`,
      batchId,
    });
    await writeAuditMany(tx, actor, entries);
    return { version: floor.version + 1, counts };
  });
}
