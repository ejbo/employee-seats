import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { newBatchId, writeAuditMany, type AuditEntry, type Db } from "@/lib/audit";
import type { Actor } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/permissions";
import { ensureDepartment } from "@/lib/departments";
import { findLinkableUserId } from "@/lib/employees/link";
import { computeImportDiff, type ImportDiff, type ImportMode, type ImportSnapshot } from "./diff";
import type { ParsedSeatRow } from "./parse";

export async function loadImportSnapshot(db: Db, officeId: string): Promise<ImportSnapshot> {
  const [seats, employees, departments] = await Promise.all([
    db.seat.findMany({
      where: { officeId },
      select: { id: true, code: true, floorId: true, status: true, employeeId: true, floor: { select: { name: true } } },
    }),
    db.employee.findMany({
      select: {
        id: true,
        employeeKey: true,
        employeeNo: true,
        name: true,
        team: true,
        title: true,
        email: true,
        phone: true,
        note: true,
        isActive: true,
        department: { select: { name: true } },
        seat: { select: { id: true, code: true, officeId: true, floor: { select: { name: true } } } },
      },
    }),
    db.department.findMany({ select: { name: true } }),
  ]);
  return {
    officeId,
    seats: seats.map((s) => ({ id: s.id, code: s.code, floorId: s.floorId, floorName: s.floor.name, status: s.status, employeeId: s.employeeId })),
    employees: employees.map((e) => ({
      id: e.id,
      employeeKey: e.employeeKey,
      employeeNo: e.employeeNo,
      name: e.name,
      departmentName: e.department?.name ?? null,
      team: e.team,
      title: e.title,
      email: e.email,
      phone: e.phone,
      note: e.note,
      isActive: e.isActive,
      seat: e.seat ? { id: e.seat.id, code: e.seat.code, floorName: e.seat.floor.name, officeId: e.seat.officeId } : null,
    })),
    departmentNames: departments.map((d) => d.name),
  };
}

export interface ImportResult {
  batchId: string;
  summary: ImportDiff["summary"];
}

const REASON_LABEL: Record<string, string> = {
  not_in_sheet: "不在表内",
  blank_seat: "表内座位为空",
  deactivated: "离职",
  displaced: "座位被他人占用",
  empty_seat: "清空座位",
};

/** 预览之后的正式应用：事务内重算差异，哈希不一致 → 409。 */
export async function runImport(
  actor: Actor,
  input: { officeId: string; mode: ImportMode; rows: ParsedSeatRow[]; expectedHash: string },
): Promise<ImportResult> {
  return prisma.$transaction(
    async (tx) => {
      const snapshot = await loadImportSnapshot(tx, input.officeId);
      const diff = computeImportDiff({ rows: input.rows, mode: input.mode, snapshot, actorIsAdmin: isAdmin(actor.role) });
      if (diff.errors.length) throw new ApiError(400, "import_errors", { errors: diff.errors });
      if (diff.hash !== input.expectedHash) throw new ApiError(409, "preview_stale");

      const batchId = newBatchId();
      const entries: AuditEntry[] = [];
      const rowByNo = new Map(input.rows.map((r) => [r.rowNo, r]));
      const empIdByKey = new Map(snapshot.employees.map((e) => [e.employeeKey, e.id]));
      const deptCache = new Map<string, string | null>();
      const deptIdFor = async (name: string): Promise<string | null> => {
        const n = name.trim();
        if (!n) return null;
        if (!deptCache.has(n)) {
          const d = await ensureDepartment(tx, n);
          deptCache.set(n, d?.id ?? null);
        }
        return deptCache.get(n) ?? null;
      };

      // ── 员工 ──────────────────────────────────────────────────────────
      for (const ch of diff.changes) {
        const row = rowByNo.get(ch.rowNo);
        const key = ch.employeeKey;
        if (!row || !key) continue;
        if (ch.employee === "create") {
          const employeeNo = row.employeeNo.replace(/\s+/g, "");
          const created = await tx.employee.create({
            data: {
              employeeNo,
              employeeKey: key,
              name: row.name.trim(),
              departmentId: await deptIdFor(row.department),
              team: row.team,
              title: row.title,
              email: row.email,
              phone: row.phone,
              note: row.note,
              userId: await findLinkableUserId(tx, key, employeeNo),
            },
            select: { id: true },
          });
          empIdByKey.set(key, created.id);
          entries.push({
            action: "employee.create",
            targetType: "employee",
            targetId: created.id,
            officeId: input.officeId,
            after: { employeeNo, name: row.name, department: row.department || null },
            summary: `导入新建员工 ${row.name}（${employeeNo}）`,
            batchId,
          });
        } else if (ch.employee === "update" || ch.employee === "reactivate") {
          const id = empIdByKey.get(key);
          if (!id) continue;
          const data: Prisma.EmployeeUncheckedUpdateInput = {};
          if (row.name) data.name = row.name.trim();
          if (row.department) data.departmentId = await deptIdFor(row.department);
          if (row.team) data.team = row.team;
          if (row.title) data.title = row.title;
          if (row.email) data.email = row.email;
          if (row.phone) data.phone = row.phone;
          if (row.note) data.note = row.note;
          if (ch.employee === "reactivate") {
            data.isActive = true;
            data.leftAt = null;
          }
          await tx.employee.update({ where: { id }, data });
          entries.push({
            action: ch.employee === "reactivate" ? "employee.reactivate" : "employee.update",
            targetType: "employee",
            targetId: id,
            officeId: input.officeId,
            after: { fields: ch.fields },
            summary: `导入${ch.employee === "reactivate" ? "复职" : "更新"}员工 ${ch.name}（${ch.employeeNo}）${ch.fields.length ? "：" + ch.fields.join("、") : ""}`,
            batchId,
          });
        } else if (ch.employee === "deactivate") {
          const id = empIdByKey.get(key);
          if (!id) continue;
          await tx.employee.update({ where: { id }, data: { isActive: false, leftAt: new Date() } });
          entries.push({ action: "employee.deactivate", targetType: "employee", targetId: id, officeId: input.officeId, summary: `导入：员工离职 ${ch.name}（${ch.employeeNo}）`, batchId });
        }
      }

      // ── 座位：先统一释放，再分配（满足一人一座的唯一约束）─────────────────
      const releaseIds = new Set<string>();
      for (const u of diff.unassigns) releaseIds.add(u.seatId);
      for (const ch of diff.changes) {
        if (ch.from) releaseIds.add(ch.from.seatId);
        if (ch.seatId && (ch.seat === "assign" || ch.seat === "move")) releaseIds.add(ch.seatId);
      }
      if (releaseIds.size) await tx.seat.updateMany({ where: { id: { in: Array.from(releaseIds) } }, data: { employeeId: null } });
      for (const u of diff.unassigns) {
        entries.push({
          action: "seat.release",
          targetType: "seat",
          targetId: u.seatId,
          officeId: input.officeId,
          before: { employeeId: u.employeeId, name: u.name, employeeNo: u.employeeNo },
          after: { employeeId: null },
          summary: `导入：${u.name} 离开座位 ${u.code}（${REASON_LABEL[u.reason] ?? u.reason}）`,
          batchId,
        });
      }
      for (const ch of diff.changes) {
        if (!ch.seatId || !ch.employeeKey || (ch.seat !== "assign" && ch.seat !== "move")) continue;
        const id = empIdByKey.get(ch.employeeKey);
        if (!id) continue;
        await tx.seat.update({ where: { id: ch.seatId }, data: { employeeId: id } });
        entries.push({
          action: ch.seat === "move" ? "seat.move" : "seat.assign",
          targetType: "seat",
          targetId: ch.seatId,
          officeId: input.officeId,
          before: { employeeId: ch.displaced?.employeeId ?? null, fromSeat: ch.from ? { code: ch.from.code, floorName: ch.from.floorName } : null },
          after: { employeeId: id, name: ch.name, employeeNo: ch.employeeNo },
          summary: ch.seat === "move" && ch.from ? `导入：${ch.name} 从 ${ch.from.floorName} ${ch.from.code} 移到 ${ch.seatCode}` : `导入：${ch.name} 落座 ${ch.seatCode}`,
          batchId,
        });
      }

      const s = diff.summary;
      entries.push({
        action: "import.apply",
        targetType: "office",
        targetId: input.officeId,
        officeId: input.officeId,
        after: s,
        summary: `导入座位表（${input.mode === "replace" ? "全量替换" : "合并"}）：新建 ${s.created}、更新 ${s.updated}、复职 ${s.reactivated}、离职 ${s.deactivated}、落座 ${s.assigned}、移动 ${s.moved}、释放 ${s.unassigned}`,
        batchId,
      });
      await writeAuditMany(tx, actor, entries);
      return { batchId, summary: s };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000, maxWait: 10_000 },
  );
}
