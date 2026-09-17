import { describe, expect, it } from "vitest";
import { computeImportDiff, type ImportSnapshot } from "@/lib/import/diff";
import type { ParsedSeatRow } from "@/lib/import/parse";

const row = (p: Partial<ParsedSeatRow>, rowNo = 2): ParsedSeatRow => ({
  rowNo,
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
  ...p,
});

function snapshot(): ImportSnapshot {
  return {
    officeId: "office1",
    seats: [
      { id: "sA01", code: "A01", floorId: "f1", floorName: "3F", status: "ACTIVE", employeeId: "e1" },
      { id: "sA02", code: "A02", floorId: "f1", floorName: "3F", status: "ACTIVE", employeeId: null },
      { id: "sA03", code: "A03", floorId: "f1", floorName: "3F", status: "ACTIVE", employeeId: null },
      { id: "sX1", code: "X01", floorId: "f1", floorName: "3F", status: "ACTIVE", employeeId: null },
      { id: "sX2", code: "X01", floorId: "f2", floorName: "4F", status: "ACTIVE", employeeId: null },
      { id: "sC01", code: "C01", floorId: "f1", floorName: "3F", status: "RESERVED", employeeId: null },
    ],
    employees: [
      { id: "e1", employeeKey: "1001", employeeNo: "1001", name: "张三", departmentName: "研发一部", team: "", title: "", email: "", phone: "", note: "", isActive: true, seat: { id: "sA01", code: "A01", floorName: "3F", officeId: "office1" } },
      { id: "e2", employeeKey: "1002", employeeNo: "z1002", name: "李四", departmentName: null, team: "", title: "", email: "", phone: "", note: "", isActive: true, seat: null },
      { id: "e3", employeeKey: "1003", employeeNo: "1003", name: "王五", departmentName: null, team: "", title: "", email: "", phone: "", note: "", isActive: false, seat: null },
      { id: "e4", employeeKey: "1004", employeeNo: "1004", name: "赵六", departmentName: null, team: "", title: "", email: "", phone: "", note: "", isActive: true, seat: { id: "sOther", code: "Q01", floorName: "1F", officeId: "office2" } },
    ],
    departmentNames: ["研发一部"],
  };
}

const run = (rows: ParsedSeatRow[], mode: "merge" | "replace" = "merge", admin = false) =>
  computeImportDiff({ rows, mode, snapshot: snapshot(), actorIsAdmin: admin });

describe("computeImportDiff", () => {
  it("creates a new employee, assigns the seat and flags a new department", () => {
    const d = run([row({ seatCode: "a02", employeeNo: "1005", name: "新人", department: "新部门" })]);
    expect(d.errors).toEqual([]);
    expect(d.changes[0]).toMatchObject({ employee: "create", seat: "assign", seatId: "sA02" });
    expect(d.summary).toMatchObject({ created: 1, assigned: 1, newDepartments: ["新部门"] });
    expect(d.warnings.some((w) => w.code === "new_department")).toBe(true);
  });

  it("moves an employee who already sits elsewhere in the office", () => {
    const d = run([row({ seatCode: "A03", employeeNo: "1001", name: "张三" })]);
    expect(d.changes[0]).toMatchObject({ employee: "unchanged", seat: "move", from: { seatId: "sA01", code: "A01" } });
    expect(d.summary.moved).toBe(1);
  });

  it("matches 工号 by digit run (z1002 == 1002) and reports updated fields", () => {
    const d = run([row({ employeeNo: "1002", name: "李四", department: "研发一部", title: "工程师" })]);
    expect(d.changes[0]).toMatchObject({ employee: "update", fields: ["部门", "职位"], seat: "none" });
  });

  it("rejects new employees without a name and duplicate 工号 rows", () => {
    const d = run([row({ employeeNo: "1006" }, 2), row({ employeeNo: "1002", name: "李四" }, 3), row({ employeeNo: "z1002", name: "李四" }, 4)]);
    expect(d.errors.map((e) => e.code)).toEqual(["missing_name", "duplicate_employee"]);
    expect(d.errors[1].rowNo).toBe(4);
  });

  it("rejects unknown, ambiguous and reserved seats, but accepts a floor-qualified code", () => {
    const d = run([
      row({ seatCode: "Z99", employeeNo: "1002", name: "李四" }, 2),
      row({ seatCode: "X01", employeeNo: "1005", name: "新人" }, 3),
      row({ seatCode: "C01", employeeNo: "1006", name: "新人2" }, 4),
      row({ seatCode: "X01", floor: "4F", employeeNo: "1007", name: "新人3" }, 5),
    ]);
    expect(d.errors.map((e) => e.code)).toEqual(["unknown_seat", "ambiguous_seat", "seat_disabled"]);
    expect(d.changes.find((c) => c.rowNo === 5)).toMatchObject({ seat: "assign", seatId: "sX2" });
  });

  it("handles departures: deactivate + release", () => {
    const d = run([row({ employeeNo: "1001", status: "离职" })]);
    expect(d.changes[0]).toMatchObject({ employee: "deactivate", seat: "unassign" });
    expect(d.unassigns).toEqual([expect.objectContaining({ seatId: "sA01", reason: "deactivated" })]);
  });

  it("warns when an occupant gets displaced and lists them as unassigned", () => {
    const d = run([row({ seatCode: "A01", employeeNo: "1002", name: "李四" })]);
    expect(d.changes[0]).toMatchObject({ seat: "assign", displaced: { employeeId: "e1" } });
    expect(d.warnings.some((w) => w.code === "displaced")).toBe(true);
    expect(d.unassigns[0]).toMatchObject({ employeeId: "e1", reason: "displaced" });
  });

  it("does not treat a displaced occupant as unassigned when the sheet re-seats them", () => {
    const d = run([row({ seatCode: "A01", employeeNo: "1002", name: "李四" }, 2), row({ seatCode: "A02", employeeNo: "1001", name: "张三" }, 3)]);
    expect(d.changes[0].displaced).toBeNull();
    expect(d.unassigns).toEqual([]);
    expect(d.summary).toMatchObject({ assigned: 1, moved: 1 });
  });

  it("reactivates an inactive employee with a warning", () => {
    const d = run([row({ seatCode: "A02", employeeNo: "1003", name: "王五" })]);
    expect(d.changes[0]).toMatchObject({ employee: "reactivate", seat: "assign" });
    expect(d.warnings.some((w) => w.code === "reactivated")).toBe(true);
  });

  it("blocks cross-office moves for non-admins and allows them for admins", () => {
    const rows = [row({ seatCode: "A02", employeeNo: "1004", name: "赵六" })];
    expect(run(rows).errors[0].code).toBe("cross_office_move_forbidden");
    const admin = run(rows, "merge", true);
    expect(admin.errors).toEqual([]);
    expect(admin.changes[0]).toMatchObject({ seat: "move", from: { crossOffice: true } });
  });

  it("replace mode releases occupants that are not in the sheet and blank-seat rows", () => {
    const d = run([row({ seatCode: "A02", employeeNo: "1002", name: "李四" })], "replace");
    expect(d.unassigns).toEqual([expect.objectContaining({ seatId: "sA01", employeeId: "e1", reason: "not_in_sheet" })]);
    const blank = run([row({ employeeNo: "1001", name: "张三" })], "replace");
    expect(blank.changes[0].seat).toBe("unassign");
    expect(blank.unassigns[0]).toMatchObject({ seatId: "sA01", reason: "blank_seat" });
  });

  it("a row with only a seat code empties that seat", () => {
    const d = run([row({ seatCode: "A01" })]);
    expect(d.errors).toEqual([]);
    expect(d.unassigns[0]).toMatchObject({ seatId: "sA01", reason: "empty_seat" });
  });

  it("hash is stable for identical input and changes with the input", () => {
    const a = run([row({ seatCode: "A02", employeeNo: "1002", name: "李四" })]);
    const b = run([row({ seatCode: "A02", employeeNo: "1002", name: "李四" })]);
    const c = run([row({ seatCode: "A03", employeeNo: "1002", name: "李四" })]);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
  });
});
