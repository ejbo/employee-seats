import type { GlobalRole, OfficeRole } from "@/lib/permissions";

export const ROLE_LABELS: Record<GlobalRole, string> = {
  USER: "员工",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
};

export const OFFICE_ROLE_LABELS: Record<OfficeRole, string> = {
  EDITOR: "座位编辑",
  MANAGER: "办公室管理员",
};

export type SeatStatus = "ACTIVE" | "RESERVED" | "DISABLED";
export type SeatState = "free" | "occupied" | "reserved" | "disabled";

export const SEAT_STATUS_LABELS: Record<SeatStatus, string> = {
  ACTIVE: "正常",
  RESERVED: "预留",
  DISABLED: "停用",
};

export const SEAT_STATE_LABELS: Record<SeatState, string> = {
  free: "空闲",
  occupied: "已用",
  reserved: "预留",
  disabled: "停用",
};

/** API 错误码 → 用户可读文案。 */
export const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "请先登录",
  forbidden: "没有权限执行此操作",
  not_found: "对象不存在或已被删除",
  invalid_input: "输入内容不合法",
  invalid_json: "请求格式错误",
  conflict: "数据冲突，请刷新后重试",
  version_conflict: "楼层已被他人修改，请重新加载后再保存",
  seat_occupied: "该座位已有人",
  employee_seated: "该员工已有座位",
  seat_code_taken: "座位编号已存在",
  preview_stale: "数据已变化，请重新预览后再应用",
  office_exists: "同一研究所/城市下已有同名办公室",
  office_has_seated: "办公室仍有已落座员工，无法删除",
  floor_exists: "该办公室已有同名楼层",
  floor_has_seated: "楼层仍有已落座员工，无法删除",
  department_exists: "部门名称已存在",
  employee_exists: "该工号已存在",
  invalid_employee_no: "工号格式不正确",
  employee_not_found: "员工不存在",
  employee_inactive: "该员工已离职，请先复职",
  seat_not_assignable: "预留或停用的座位不能分配",
  cross_office_move_forbidden: "跨办公室移动座位需要管理员权限",
  unsupported_file: "不支持的文件类型（仅 PNG / JPG / WebP）",
  file_too_large: "文件太大",
  same_seat: "不能选择同一个座位",
  import_errors: "导入内容有错误，请按提示修正后重新预览",
  no_rows: "文件里没有可导入的数据（请确认第一行是表头）",
  user_not_found: "没有找到该工号的用户",
  last_super_admin: "不能移除最后一个超级管理员",
  cannot_change_self: "不能修改自己的角色",
  internal_error: "服务器开小差了，请稍后重试",
};

export function errorMessage(code: string | undefined, fallback = "操作失败"): string {
  if (!code) return fallback;
  return ERROR_MESSAGES[code] ?? `${fallback}（${code}）`;
}
