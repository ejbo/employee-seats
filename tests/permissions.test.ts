import { describe, expect, it } from "vitest";
import { effectiveOfficeRank, officeCapabilities, ROLE_RANK } from "@/lib/permissions";

describe("permissions lattice", () => {
  it("global role dominates office grant", () => {
    expect(effectiveOfficeRank("ADMIN", null)).toBe(ROLE_RANK.ADMIN);
    expect(effectiveOfficeRank("USER", "MANAGER")).toBe(ROLE_RANK.MANAGER);
    expect(effectiveOfficeRank("USER", null)).toBe(0);
  });
  it("derives capabilities", () => {
    expect(officeCapabilities("USER", null)).toMatchObject({ canAssign: false, canEditLayout: false, canGrantEditor: false, canManageOffice: false });
    expect(officeCapabilities("USER", "EDITOR")).toMatchObject({ canAssign: true, canEditLayout: false });
    expect(officeCapabilities("USER", "MANAGER")).toMatchObject({ canAssign: true, canEditLayout: true, canGrantEditor: true, canManageOffice: false });
    expect(officeCapabilities("ADMIN", null)).toMatchObject({ canEditLayout: true, canManageOffice: true });
    expect(officeCapabilities("SUPER_ADMIN", "EDITOR").canManageOffice).toBe(true);
  });
});
