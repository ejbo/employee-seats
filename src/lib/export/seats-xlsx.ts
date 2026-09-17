import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { compareSeatCodes } from "@/lib/employee-key";
import { SEAT_STATUS_LABELS } from "@/lib/labels";

/** 座位表导出：按办公室或楼层。 */
export async function buildSeatTableXlsx(filter: { officeId?: string; floorId?: string }): Promise<{ buffer: Buffer; filename: string }> {
  const seats = await prisma.seat.findMany({
    where: filter.floorId ? { floorId: filter.floorId } : filter.officeId ? { officeId: filter.officeId } : {},
    select: {
      code: true,
      status: true,
      note: true,
      updatedAt: true,
      zone: { select: { name: true } },
      floor: { select: { name: true, sortOrder: true, office: { select: { name: true, city: true, institute: true } } } },
      employee: { select: { employeeNo: true, name: true, team: true, title: true, email: true, phone: true, department: { select: { name: true } } } },
    },
  });
  seats.sort((a, b) => a.floor.sortOrder - b.floor.sortOrder || a.floor.name.localeCompare(b.floor.name) || compareSeatCodes(a.code, b.code));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("座位表", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "研究所", key: "institute", width: 14 },
    { header: "城市", key: "city", width: 10 },
    { header: "办公室", key: "office", width: 18 },
    { header: "楼层", key: "floor", width: 10 },
    { header: "区域", key: "zone", width: 14 },
    { header: "座位编号", key: "code", width: 12 },
    { header: "状态", key: "status", width: 8 },
    { header: "工号", key: "employeeNo", width: 12 },
    { header: "姓名", key: "name", width: 12 },
    { header: "部门", key: "department", width: 14 },
    { header: "团队", key: "team", width: 14 },
    { header: "职位", key: "title", width: 14 },
    { header: "邮箱", key: "email", width: 26 },
    { header: "电话", key: "phone", width: 14 },
    { header: "备注", key: "note", width: 24 },
    { header: "更新时间", key: "updatedAt", width: 20 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F4" } };
  });
  for (const s of seats) {
    const state = s.status === "ACTIVE" ? (s.employee ? "已用" : "空闲") : SEAT_STATUS_LABELS[s.status];
    ws.addRow({
      institute: s.floor.office.institute,
      city: s.floor.office.city,
      office: s.floor.office.name,
      floor: s.floor.name,
      zone: s.zone?.name ?? "",
      code: s.code,
      status: state,
      employeeNo: s.employee?.employeeNo ?? "",
      name: s.employee?.name ?? "",
      department: s.employee?.department?.name ?? "",
      team: s.employee?.team ?? "",
      title: s.employee?.title ?? "",
      email: s.employee?.email ?? "",
      phone: s.employee?.phone ?? "",
      note: s.note,
      updatedAt: s.updatedAt,
    });
  }
  ws.getColumn("updatedAt").numFmt = "yyyy-mm-dd hh:mm";
  ws.autoFilter = { from: "A1", to: `P${Math.max(1, seats.length + 1)}` };

  const first = seats[0];
  const name = first ? `${first.floor.office.name}${filter.floorId ? `-${first.floor.name}` : ""}` : "座位表";
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${name}-座位表.xlsx` };
}
