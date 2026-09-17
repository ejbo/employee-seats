import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseCsv, parsePastedTable, parseUpload, parseXlsx } from "@/lib/import/parse";

describe("parsePastedTable", () => {
  it("reads a tab separated table with Chinese headers", () => {
    const r = parsePastedTable("座位编号\t工号\t姓名\t部门\nA01\t00123456\t张三\t研发一部\n\nB02\t\t\t\n");
    expect(r.matched).toEqual(["seatCode", "employeeNo", "name", "department"]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ rowNo: 2, seatCode: "A01", employeeNo: "00123456", name: "张三", department: "研发一部" });
    expect(r.rows[1]).toMatchObject({ rowNo: 4, seatCode: "B02", employeeNo: "" });
  });
});

describe("parseCsv", () => {
  it("maps English/Chinese aliases order-independently and strips BOM", () => {
    const csv = "﻿部门,姓名,工号,座位号,状态,未知列\n研发一部,张三,z10001,A01,,x\n,李四,10002,,离职,\n";
    const r = parseCsv(new TextEncoder().encode(csv));
    expect(r.unknownHeaders).toEqual(["未知列"]);
    expect(r.rows[0]).toMatchObject({ seatCode: "A01", employeeNo: "z10001", name: "张三", department: "研发一部" });
    expect(r.rows[1]).toMatchObject({ employeeNo: "10002", status: "离职" });
  });
  it("decodes gbk when the bytes are not utf-8", () => {
    const gbk = new Uint8Array([0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xb9, 0xa4, 0xba, 0xc5, 0x0a, 0xd5, 0xc5, 0xc8, 0xfd, 0x2c, 0x31, 0x30, 0x30, 0x31, 0x0a]); // 姓名,工号\n张三,1001\n
    const r = parseCsv(gbk);
    expect(r.rows[0]).toMatchObject({ name: "张三", employeeNo: "1001" });
  });
});

async function buildXlsx(rows: string[][]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", `<workbook><sheets><sheet name="座位表" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`);
  const col = (i: number) => String.fromCharCode(65 + i);
  const body = rows
    .map((cells, r) => `<row r="${r + 1}">${cells.map((v, c) => (v === "" ? "" : `<c r="${col(c)}${r + 1}" t="inlineStr"><is><t>${v}</t></is></c>`)).join("")}</row>`)
    .join("");
  zip.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData>${body}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "uint8array" });
}

describe("parseXlsx", () => {
  it("reads the first sheet with inline strings and sparse cells", async () => {
    const buf = await buildXlsx([
      ["座位编号", "工号", "姓名", "楼层"],
      ["A01", "10001", "张三", "3F"],
      ["", "10002", "李四", ""],
    ]);
    const r = await parseXlsx(buf);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ seatCode: "A01", employeeNo: "10001", name: "张三", floor: "3F" });
    expect(r.rows[1]).toMatchObject({ seatCode: "", employeeNo: "10002", name: "李四" });
  });
  it("parseUpload dispatches by extension", async () => {
    await expect(parseUpload("x.docx", new Uint8Array())).rejects.toThrow(/不支持/);
    const csv = await parseUpload("a.csv", new TextEncoder().encode("姓名,工号\n张三,1\n"));
    expect(csv.rows[0].name).toBe("张三");
  });
});
