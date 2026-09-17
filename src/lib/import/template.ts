import "server-only";
import ExcelJS from "exceljs";
import { HEADER_LABELS, TEMPLATE_FIELDS } from "./parse";

export interface TemplateSeat {
  code: string;
  floorName: string;
  status: string;
  occupant: string | null;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle" };
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F4" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD2D2D8" } } };
  });
}

/** 导入模板：表 1 座位表（带座位编号下拉），表 2 座位清单，表 3 说明。 */
export async function buildImportTemplate(office: { name: string }, seats: TemplateSeat[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "座位图";
  const ws = wb.addWorksheet("座位表", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = TEMPLATE_FIELDS.map((f) => ({
    header: HEADER_LABELS[f],
    key: f,
    width: f === "email" ? 26 : f === "note" ? 24 : f === "name" ? 12 : 14,
  }));
  styleHeader(ws.getRow(1));

  const list = wb.addWorksheet("座位清单", { views: [{ state: "frozen", ySplit: 1 }] });
  list.columns = [
    { header: "座位编号", key: "code", width: 14 },
    { header: "楼层", key: "floor", width: 12 },
    { header: "状态", key: "status", width: 10 },
    { header: "当前占用", key: "occupant", width: 16 },
  ];
  styleHeader(list.getRow(1));
  for (const s of seats) list.addRow({ code: s.code, floor: s.floorName, status: s.status, occupant: s.occupant ?? "" });

  if (seats.length > 0) {
    const ref = `座位清单!$A$2:$A$${seats.length + 1}`;
    for (let r = 2; r <= 1500; r++) {
      ws.getCell(r, 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ref],
        showErrorMessage: false,
        promptTitle: "座位编号",
        prompt: "从「座位清单」中选择，或留空",
      };
    }
  }

  const help = wb.addWorksheet("说明");
  help.columns = [{ width: 100 }];
  const lines = [
    `办公室：${office.name}`,
    "",
    "填写规则：",
    "1. 第一行是表头，列顺序不限；「座位编号」「工号」「姓名」「部门」为常用列，其余可留空。",
    "2. 工号是唯一身份：已有员工按工号更新信息并落座；新工号 + 姓名 = 新建员工。",
    "3. 座位编号需与「座位清单」一致；同一编号在多个楼层出现时请填「楼层」列。",
    "4. 一行只有座位编号、没有工号和姓名 = 清空该座位。",
    "5. 「状态」填「离职」= 该员工离职并释放座位。",
    "6. 合并模式：只改表里出现的人和座位。全量替换模式：表就是本办公室的全部真相，不在表内的占用者会被释放。",
    "7. 导入前会先预览所有变更，确认后才写入。",
  ];
  for (const l of lines) help.addRow([l]);
  help.getRow(1).font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
