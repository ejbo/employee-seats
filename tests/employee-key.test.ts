import { describe, expect, it } from "vitest";
import { accountMatchKey, canonicalAccountText, compareSeatCodes, normalizeSeatCode, sameAccount } from "@/lib/employee-key";

describe("accountMatchKey", () => {
  it("strips the W3 letter prefix and folds fullwidth digits", () => {
    expect(accountMatchKey("z84412632")).toBe("84412632");
    expect(accountMatchKey("Z84412632")).toBe("84412632");
    expect(accountMatchKey("ｚ８４４１２６３２")).toBe("84412632");
    expect(accountMatchKey(" 8441 2632 ")).toBe("84412632");
  });
  it("keeps leading zeros and falls back to text when there are no digits", () => {
    expect(accountMatchKey("00412632")).toBe("00412632");
    expect(accountMatchKey("ABC")).toBe("abc");
    expect(accountMatchKey("")).toBeNull();
    expect(accountMatchKey(null)).toBeNull();
  });
  it("sameAccount compares keys", () => {
    expect(sameAccount("z84412632", "84412632")).toBe(true);
    expect(sameAccount("84412632", "084412632")).toBe(false);
    expect(canonicalAccountText("Ａ B c")).toBe("abc");
  });
});

describe("seat codes", () => {
  it("normalizes fullwidth, whitespace and case", () => {
    expect(normalizeSeatCode(" a-01 ")).toBe("A-01");
    expect(normalizeSeatCode("Ａ－０１")).toBe("A-01");
  });
  it("sorts naturally", () => {
    expect(["A-10", "A-2", "A-1"].sort(compareSeatCodes)).toEqual(["A-1", "A-2", "A-10"]);
  });
});
