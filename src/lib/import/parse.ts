/**
 * 把粘贴文本 / CSV / XLSX 解析成座位表行（改自 skills-community 的花名册导入器）。
 *   - 第一行是表头，列按别名匹配（中英文都行、顺序无关）
 *   - CSV 先按 utf-8，失败回退 gbk（老 Excel 导出）
 *   - XLSX 用 jszip 读第一张工作表（不依赖 SheetJS）
 */
import JSZip from "jszip";

export interface ParsedSeatRow {
  /** 表格里的行号（表头为第 1 行） */
  rowNo: number;
  seatCode: string;
  employeeNo: string;
  name: string;
  department: string;
  team: string;
  title: string;
  email: string;
  phone: string;
  note: string;
  floor: string;
  status: string;
}

export type SeatRowField = Exclude<keyof ParsedSeatRow, "rowNo">;

export const COLUMN_ALIASES: Record<SeatRowField, ReadonlySet<string>> = {
  seatCode: new Set(["seat", "seatcode", "seat_code", "seatno", "seat_no", "座位编号", "座位号", "座位", "工位", "工位号", "工位编号", "位置"]),
  employeeNo: new Set(["employeeno", "employee_no", "account", "account_number", "accountnumber", "uid", "id", "工号", "员工号", "员工编号", "账号"]),
  name: new Set(["name", "姓名", "员工姓名", "员工", "人员", "名字"]),
  department: new Set(["department", "dept", "部门", "所属部门", "一级部门", "事业部"]),
  team: new Set(["team", "group", "团队", "小组", "二级部门", "科室", "组"]),
  title: new Set(["title", "position", "职位", "岗位", "职务"]),
  email: new Set(["email", "mail", "邮箱", "邮件", "电子邮箱"]),
  phone: new Set(["phone", "tel", "mobile", "电话", "手机", "手机号", "联系电话"]),
  note: new Set(["note", "notes", "remark", "remarks", "comment", "备注", "说明"]),
  floor: new Set(["floor", "楼层", "层", "楼"]),
  status: new Set(["status", "state", "状态", "在职状态"]),
};

export const HEADER_LABELS: Record<SeatRowField, string> = {
  seatCode: "座位编号",
  employeeNo: "工号",
  name: "姓名",
  department: "部门",
  note: "备注",
  floor: "楼层",
  team: "团队",
  title: "职位",
  email: "邮箱",
  phone: "电话",
  status: "状态",
};

/** 模板列顺序 */
export const TEMPLATE_FIELDS: SeatRowField[] = ["seatCode", "employeeNo", "name", "department", "note", "floor", "team", "title", "email", "phone", "status"];

const EMPTY: Omit<ParsedSeatRow, "rowNo"> = {
  seatCode: "",
  employeeNo: "",
  name: "",
  department: "",
  team: "",
  title: "",
  email: "",
  phone: "",
  note: "",
  floor: "",
  status: "",
};

export interface ParseResult {
  rows: ParsedSeatRow[];
  /** 表头里被识别的字段 */
  matched: SeatRowField[];
  /** 没识别出来的表头 */
  unknownHeaders: string[];
}

function normalizeHeader(h: string): string {
  return h.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "").replace(/-/g, "_").replace(/[（(].*?[)）]/g, "");
}

function headerField(header: string): SeatRowField | null {
  for (const key of Object.keys(COLUMN_ALIASES) as SeatRowField[]) if (COLUMN_ALIASES[key].has(header)) return key;
  return null;
}

function toRows(table: string[][]): ParseResult {
  if (!table.length) return { rows: [], matched: [], unknownHeaders: [] };
  const rawHeaders = table[0].map((h) => (h ?? "").toString());
  const fields = rawHeaders.map((h) => headerField(normalizeHeader(h)));
  const matched = fields.filter((f): f is SeatRowField => f !== null);
  const unknownHeaders = rawHeaders.filter((h, i) => h.trim() && fields[i] === null);
  const rows: ParsedSeatRow[] = [];
  table.slice(1).forEach((cells, i) => {
    if (!cells.some((c) => (c ?? "").toString().trim())) return;
    const row: ParsedSeatRow = { rowNo: i + 2, ...EMPTY };
    cells.forEach((value, idx) => {
      const f = fields[idx];
      if (f) row[f] = (value ?? "").toString().normalize("NFKC").trim();
    });
    if (row.seatCode || row.employeeNo || row.name) rows.push(row);
  });
  return { rows, matched: Array.from(new Set(matched)), unknownHeaders };
}

/** RFC-4180 风格 CSV：引号、双引号转义、引号内换行。 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === "," || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function decodeText(buf: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("gbk").decode(buf);
  }
}

export function parseCsv(buf: Uint8Array): ParseResult {
  return toRows(parseCsvText(decodeText(buf)));
}

/** 粘贴的表格文本（第一行表头，制表符或逗号分隔）。 */
export function parsePastedTable(text: string): ParseResult {
  return toRows(parseCsvText(text.replace(/^﻿/, "")));
}

// ── XLSX（jszip）─────────────────────────────────────────────────────────────
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function textContent(xmlFragment: string): string {
  const cleaned = xmlFragment.replace(/<rPh\b[\s\S]*?<\/rPh>|<phoneticPr\b[^>]*\/?>/g, "");
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) out += decodeXmlEntities(m[1]);
  return out;
}

function colRefToIndex(ref: string): number {
  let idx = 0;
  for (const ch of ref) {
    if (ch < "A" || ch > "Z") break;
    idx = idx * 26 + (ch.charCodeAt(0) - 64);
  }
  return idx - 1;
}

async function firstSheetXml(zip: JSZip): Promise<string> {
  const workbook = await zip.file("xl/workbook.xml")?.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (workbook && rels) {
    const sheetMatch = /<sheet\s[^>]*r:id="([^"]+)"/.exec(workbook);
    if (sheetMatch) {
      const relMatch =
        new RegExp(`<Relationship\\s[^>]*Id="${sheetMatch[1]}"[^>]*Target="([^"]+)"`).exec(rels) ??
        new RegExp(`<Relationship\\s[^>]*Target="([^"]+)"[^>]*Id="${sheetMatch[1]}"`).exec(rels);
      if (relMatch) {
        const target = relMatch[1].replace(/^\//, "").replace(/^xl\//, "");
        const file = zip.file(`xl/${target}`);
        if (file) return file.async("string");
      }
    }
  }
  const fallback = zip.file("xl/worksheets/sheet1.xml");
  if (!fallback) throw new Error("xlsx 里找不到工作表");
  return fallback.async("string");
}

export async function parseXlsx(buf: Uint8Array): Promise<ParseResult> {
  const zip = await JSZip.loadAsync(buf);
  const sharedXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  const shared: string[] = [];
  {
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sharedXml))) shared.push(textContent(m[1]));
  }
  const sheetXml = await firstSheetXml(zip);
  const rows: string[][] = [];
  const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(sheetXml))) {
    const cells: string[] = [];
    const cellRe = /<c\s([^>]*?)\/>|<c\s([^>]*?)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const attrs = cellMatch[1] ?? cellMatch[2] ?? "";
      const body = cellMatch[3] ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const col = ref ? colRefToIndex(ref) : cells.length;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      let value = "";
      if (type === "s") {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
        value = shared[parseInt(v, 10)] ?? "";
      } else if (type === "inlineStr") value = textContent(body);
      else value = decodeXmlEntities(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      cells[col] = value;
    }
    rows.push(Array.from(cells, (c) => c ?? ""));
  }
  return toRows(rows);
}

/** 按扩展名分发；只支持 .csv / .xlsx。 */
export async function parseUpload(filename: string, buf: Uint8Array): Promise<ParseResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(buf);
  if (lower.endsWith(".xlsx")) return parseXlsx(buf);
  throw new Error(`不支持的文件格式：${filename}（仅支持 .csv / .xlsx）`);
}
