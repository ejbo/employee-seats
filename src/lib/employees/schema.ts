import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).default("");

export const employeeInputSchema = z.object({
  employeeNo: z.string().trim().min(1, "工号不能为空").max(32),
  name: z.string().trim().min(1, "姓名不能为空").max(64),
  /** 部门名（不存在则自动创建）；空字符串 = 清空部门 */
  departmentName: z.string().trim().max(64).optional(),
  team: text(64),
  title: text(64),
  email: text(128),
  phone: text(32),
  note: text(500),
});
export type EmployeeInput = z.infer<typeof employeeInputSchema>;

export const employeePatchSchema = employeeInputSchema.partial();
export type EmployeePatch = z.infer<typeof employeePatchSchema>;

export const employeeQuerySchema = z.object({
  q: z.string().trim().max(64).optional(),
  departmentId: z.string().max(64).optional(),
  officeId: z.string().max(64).optional(),
  /** "1" = 只看未落座 */
  unassigned: z.enum(["1", "0"]).optional(),
  /** 默认只看在职；"0" 看离职；"all" 全部 */
  active: z.enum(["1", "0", "all"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;
