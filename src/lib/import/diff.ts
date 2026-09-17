/**
 * 导入差异计算（纯函数，可测试）：把表格行 + 当前快照 → 逐行变更 / 错误 / 警告 / 汇总 / 哈希。
 * 错误 = 整体阻断（全有或全无）；警告 = 允许但要让人看见。
 */
import { accountMatchKey, canonicalPersonName, normalizeSeatCode } from "@/lib/employee-key";
import type { ParsedSeatRow } from "./parse";

export type ImportMode = "merge" | "replace";

export interface SnapshotSeat {
  id: string;
  code: string;
  floorId: string;
  floorName: string;
  status: "ACTIVE" | "RESERVED" | "DISABLED";
  employeeId: string | null;
}
export interface SnapshotEmployee {
  id: string;
  employeeKey: string;
  employeeNo: string;
  name: string;
  departmentName: string | null;
  team: string;
  title: string;
  email: string;
  phone: string;
  note: string;
  isActive: boolean;
  seat: { id: string; code: string; floorName: string; officeId: string } | null;
}
export interface ImportSnapshot {
  officeId: string;
  seats: SnapshotSeat[];
  employees: SnapshotEmployee[];
  departmentNames: string[];
}

export interface ImportIssue {
  rowNo: number;
  code: string;
  message: string;
  seatCode?: string;
  employeeNo?: string;
}

export type EmployeeAction = "create" | "update" | "reactivate" | "deactivate" | "unchanged" | "none";
export type SeatAction = "assign" | "move" | "unassign" | "unchanged" | "none";

export interface RowChange {
  rowNo: number;
  employeeNo: string;
  employeeKey: string | null;
  name: string;
  employee: EmployeeAction;
  /** 会被更新的字段（中文名） */
  fields: string[];
  seat: SeatAction;
  seatId: string | null;
  seatCode: string | null;
  from: { seatId: string; code: string; floorName: string; crossOffice: boolean } | null;
  displaced: { employeeId: string; employeeNo: string; name: string } | null;
}

export interface UnassignChange {
  seatId: string;
  code: string;
  floorName: string;
  employeeId: string;
  employeeNo: string;
  name: string;
  reason: "not_in_sheet" | "blank_seat" | "deactivated" | "displaced" | "empty_seat";
}

export interface ImportSummary {
  rows: number;
  created: number;
  updated: number;
  reactivated: number;
  deactivated: number;
  assigned: number;
  moved: number;
  unassigned: number;
  unchanged: number;
  newDepartments: string[];
}

export interface ImportDiff {
  mode: ImportMode;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  changes: RowChange[];
  unassigns: UnassignChange[];
  summary: ImportSummary;
  hash: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "姓名",
  department: "部门",
  team: "团队",
  title: "职位",
  email: "邮箱",
  phone: "电话",
  note: "备注",
};

export const DEPARTURE_RE = /离职|inactive|left|leave|resigned|停用/i;

/** FNV-1a 32 位，够用来判断“预览之后数据有没有变”。 */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function computeImportDiff(input: { rows: ParsedSeatRow[]; mode: ImportMode; snapshot: ImportSnapshot; actorIsAdmin: boolean }): ImportDiff {
  const { rows, mode, snapshot, actorIsAdmin } = input;
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const changes: RowChange[] = [];
  const unassigns: UnassignChange[] = [];

  const seatsByCode = new Map<string, SnapshotSeat[]>();
  for (const s of snapshot.seats) {
    const code = normalizeSeatCode(s.code);
    const list = seatsByCode.get(code) ?? [];
    list.push(s);
    seatsByCode.set(code, list);
  }
  const empByKey = new Map(snapshot.employees.map((e) => [e.employeeKey, e]));
  const empById = new Map(snapshot.employees.map((e) => [e.id, e]));
  const knownDepts = new Set(snapshot.departmentNames.map((d) => d.trim()));
  const newDepartments = new Set<string>();

  const seenKeys = new Map<string, number>();
  const seatClaims = new Map<string, number>();
  /** 表内明确给了新座位的员工（用来判断被挤出的人是否只是换了位置） */
  const keysWithSeatInSheet = new Set<string>();
  const deactivatedKeys = new Set<string>();
  const targetSeatIds = new Set<string>();

  const err = (rowNo: number, code: string, message: string, extra: Partial<ImportIssue> = {}) => errors.push({ rowNo, code, message, ...extra });
  const warn = (rowNo: number, code: string, message: string, extra: Partial<ImportIssue> = {}) => warnings.push({ rowNo, code, message, ...extra });

  for (const row of rows) {
    const employeeNo = row.employeeNo.replace(/\s+/g, "");
    const key = accountMatchKey(employeeNo);
    const name = row.name.trim();
    const code = normalizeSeatCode(row.seatCode);
    const floor = row.floor.trim();
    const departure = DEPARTURE_RE.test(row.status);
    if (!employeeNo && !name && !code) continue;

    // ── 座位解析 ──────────────────────────────────────────────────────────
    let target: SnapshotSeat | null = null;
    let seatError = false;
    if (code) {
      let cands = seatsByCode.get(code) ?? [];
      if (floor) cands = cands.filter((s) => canonicalPersonName(s.floorName) === canonicalPersonName(floor));
      if (cands.length === 0) {
        err(row.rowNo, "unknown_seat", floor ? `楼层「${floor}」里没有座位 ${code}` : `本办公室没有座位 ${code}`, { seatCode: code });
        seatError = true;
      } else if (cands.length > 1) {
        err(row.rowNo, "ambiguous_seat", `座位 ${code} 在多个楼层都存在（${cands.map((c) => c.floorName).join("、")}），请补充「楼层」列`, { seatCode: code });
        seatError = true;
      } else {
        target = cands[0];
        if (target.status !== "ACTIVE") {
          err(row.rowNo, "seat_disabled", `座位 ${code} 是${target.status === "RESERVED" ? "预留" : "停用"}状态，不能分配`, { seatCode: code });
          seatError = true;
        } else if (seatClaims.has(target.id)) {
          err(row.rowNo, "duplicate_seat", `座位 ${code} 在第 ${seatClaims.get(target.id)} 行已经出现`, { seatCode: code });
          seatError = true;
        } else seatClaims.set(target.id, row.rowNo);
      }
    }

    // ── 「清空座位」行：只有座位编号，没有工号和姓名 ─────────────────────
    if (!key && !name) {
      if (target && !seatError) {
        if (mode === "replace" || true) {
          const occ = target.employeeId ? empById.get(target.employeeId) : null;
          if (occ) unassigns.push({ seatId: target.id, code: target.code, floorName: target.floorName, employeeId: occ.id, employeeNo: occ.employeeNo, name: occ.name, reason: "empty_seat" });
        }
      } else if (!code) {
        err(row.rowNo, "missing_employee_no", "缺少工号");
      }
      continue;
    }
    if (!key) {
      err(row.rowNo, "missing_employee_no", `「${name}」缺少工号`, { seatCode: code || undefined });
      continue;
    }
    if (seenKeys.has(key)) {
      err(row.rowNo, "duplicate_employee", `工号 ${employeeNo} 在第 ${seenKeys.get(key)} 行已经出现`, { employeeNo });
      continue;
    }
    seenKeys.set(key, row.rowNo);

    // ── 员工 ──────────────────────────────────────────────────────────────
    const emp = empByKey.get(key);
    let employee: EmployeeAction = "none";
    const fields: string[] = [];
    if (row.department && !knownDepts.has(row.department)) newDepartments.add(row.department);
    if (!emp) {
      if (!name) {
        err(row.rowNo, "missing_name", `工号 ${employeeNo} 是新员工，缺少姓名`, { employeeNo });
        continue;
      }
      employee = departure ? "none" : "create";
      if (departure) warn(row.rowNo, "departure_unknown", `工号 ${employeeNo} 不在花名册中，离职行已忽略`, { employeeNo });
    } else {
      if (departure) {
        employee = emp.isActive ? "deactivate" : "unchanged";
        deactivatedKeys.add(key);
      } else {
        const compare: [string, string, string][] = [
          ["name", name, emp.name],
          ["department", row.department, emp.departmentName ?? ""],
          ["team", row.team, emp.team],
          ["title", row.title, emp.title],
          ["email", row.email, emp.email],
          ["phone", row.phone, emp.phone],
          ["note", row.note, emp.note],
        ];
        for (const [f, next, cur] of compare) if (next && next !== cur) fields.push(FIELD_LABELS[f]);
        if (name && canonicalPersonName(name) !== canonicalPersonName(emp.name)) {
          warn(row.rowNo, "name_changed", `工号 ${employeeNo} 的姓名将由「${emp.name}」改为「${name}」`, { employeeNo });
        }
        if (!emp.isActive) {
          employee = "reactivate";
          warn(row.rowNo, "reactivated", `${emp.name}（${employeeNo}）已离职，将恢复为在职`, { employeeNo });
        } else employee = fields.length ? "update" : "unchanged";
      }
    }

    // ── 座位动作 ──────────────────────────────────────────────────────────
    let seat: SeatAction = "none";
    let from: RowChange["from"] = null;
    let displaced: RowChange["displaced"] = null;
    const cur = emp?.seat ?? null;
    if (departure) {
      if (cur) {
        seat = "unassign";
        unassigns.push({ seatId: cur.id, code: cur.code, floorName: cur.floorName, employeeId: emp!.id, employeeNo: emp!.employeeNo, name: emp!.name, reason: "deactivated" });
      }
    } else if (target && !seatError) {
      keysWithSeatInSheet.add(key);
      targetSeatIds.add(target.id);
      if (cur && cur.id === target.id) seat = "unchanged";
      else {
        if (cur) {
          const crossOffice = cur.officeId !== snapshot.officeId;
          if (crossOffice && !actorIsAdmin) {
            err(row.rowNo, "cross_office_move_forbidden", `${emp!.name} 目前在其他办公室（${cur.floorName} ${cur.code}），跨办公室移动需要管理员`, { employeeNo });
            continue;
          }
          if (crossOffice) warn(row.rowNo, "cross_office_move", `${emp!.name} 将从其他办公室（${cur.floorName} ${cur.code}）移过来`, { employeeNo });
          from = { seatId: cur.id, code: cur.code, floorName: cur.floorName, crossOffice };
          seat = "move";
        } else seat = "assign";
        if (target.employeeId && target.employeeId !== emp?.id) {
          const occ = empById.get(target.employeeId);
          if (occ) displaced = { employeeId: occ.id, employeeNo: occ.employeeNo, name: occ.name };
        }
      }
    } else if (!code && mode === "replace" && cur && cur.officeId === snapshot.officeId) {
      seat = "unassign";
      unassigns.push({ seatId: cur.id, code: cur.code, floorName: cur.floorName, employeeId: emp!.id, employeeNo: emp!.employeeNo, name: emp!.name, reason: "blank_seat" });
    }

    changes.push({ rowNo: row.rowNo, employeeNo, employeeKey: key, name: name || emp?.name || "", employee, fields, seat, seatId: target && !seatError ? target.id : null, seatCode: target && !seatError ? target.code : code || null, from, displaced });
  }

  // 被挤出且表里没给新座位的人 → 变为未落座（警告）
  for (const ch of changes) {
    if (!ch.displaced) continue;
    const occ = empById.get(ch.displaced.employeeId);
    const occKey = occ?.employeeKey;
    if (occKey && (keysWithSeatInSheet.has(occKey) || deactivatedKeys.has(occKey))) {
      ch.displaced = null; // 对方在表里另有安排
      continue;
    }
    warn(ch.rowNo, "displaced", `座位 ${ch.seatCode} 目前是 ${ch.displaced.name}（${ch.displaced.employeeNo}）的，导入后 TA 将变为未落座`, { seatCode: ch.seatCode ?? undefined });
    if (occ) unassigns.push({ seatId: ch.seatId!, code: ch.seatCode!, floorName: "", employeeId: occ.id, employeeNo: occ.employeeNo, name: occ.name, reason: "displaced" });
  }

  // 全量替换：本办公室里不在表内的占用者全部释放
  if (mode === "replace") {
    for (const s of snapshot.seats) {
      if (!s.employeeId || targetSeatIds.has(s.id)) continue;
      const occ = empById.get(s.employeeId);
      if (!occ || seenKeys.has(occ.employeeKey)) continue;
      if (unassigns.some((u) => u.seatId === s.id)) continue;
      unassigns.push({ seatId: s.id, code: s.code, floorName: s.floorName, employeeId: occ.id, employeeNo: occ.employeeNo, name: occ.name, reason: "not_in_sheet" });
    }
  }

  const summary: ImportSummary = {
    rows: rows.length,
    created: changes.filter((c) => c.employee === "create").length,
    updated: changes.filter((c) => c.employee === "update").length,
    reactivated: changes.filter((c) => c.employee === "reactivate").length,
    deactivated: changes.filter((c) => c.employee === "deactivate").length,
    assigned: changes.filter((c) => c.seat === "assign").length,
    moved: changes.filter((c) => c.seat === "move").length,
    unassigned: unassigns.length,
    unchanged: changes.filter((c) => c.employee === "unchanged" && (c.seat === "unchanged" || c.seat === "none")).length,
    newDepartments: Array.from(newDepartments).sort(),
  };
  for (const d of summary.newDepartments) warnings.push({ rowNo: 0, code: "new_department", message: `将新建部门「${d}」` });

  const hash = stableHash(
    JSON.stringify({
      mode,
      officeId: snapshot.officeId,
      changes: changes.map((c) => [c.rowNo, c.employeeKey, c.employee, c.fields, c.seat, c.seatId, c.from?.seatId ?? null, c.displaced?.employeeId ?? null]),
      unassigns: unassigns.map((u) => [u.seatId, u.employeeId, u.reason]).sort(),
    }),
  );

  return { mode, errors, warnings, changes, unassigns, summary, hash };
}
