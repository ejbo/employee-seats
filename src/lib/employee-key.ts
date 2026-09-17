/**
 * 工号 / 座位编号的规范化与匹配键（纯函数，客户端/服务端/测试通用）。
 *
 * 花名册里的工号常带 W3 账号前缀（`z84412632`，有时大写），而 SSO 给的 uid 是裸工号
 * （`84412632`），逐字比较永远对不上。匹配键取“数字段”，并按字符串比较（前导零有意义）。
 */

/** 工号的规范文本：NFKC（全角→半角）、去空白、小写。 */
export function canonicalAccountText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** 姓名的匹配文本：同样折叠，`李 明`/`李明`、`Li Wei`/`liwei` 视为同一人。 */
export function canonicalPersonName(value: string | null | undefined): string {
  return canonicalAccountText(value);
}

/**
 * 工号匹配键：有数字则取数字段（`z84412632`/`Z84412632`/`84412632` → `84412632`），
 * 否则取规范文本；空值 → null。只能用 `===` 比较，绝不转成数字。
 */
export function accountMatchKey(value: string | null | undefined): string | null {
  const text = canonicalAccountText(value);
  if (!text) return null;
  const digits = text.replace(/\D+/g, "");
  return digits || text;
}

/** 两个工号写法是否指同一个人。 */
export function sameAccount(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = accountMatchKey(a);
  return ka !== null && ka === accountMatchKey(b);
}

/** 座位编号规范化：NFKC、去空白、大写（`a-01` / `Ａ－０１` → `A-01`）。 */
export function normalizeSeatCode(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

/** 座位编号自然排序（A-2 排在 A-10 前面）。 */
export function compareSeatCodes(a: string, b: string): number {
  return a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}
