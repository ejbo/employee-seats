/**
 * 权限模型（纯函数，客户端/服务端均可用）。
 *
 * 全局角色：USER < ADMIN < SUPER_ADMIN
 * 办公室授权：EDITOR（分配座位）< MANAGER（编辑布局 + 导入 + 授 EDITOR）
 * ADMIN 及以上隐含所有办公室的 MANAGER；任免 ADMIN 仅 SUPER_ADMIN。
 *
 * 等级格：USER 0 < EDITOR 1 < MANAGER 2 < ADMIN 3 < SUPER_ADMIN 4
 */
export type GlobalRole = "USER" | "ADMIN" | "SUPER_ADMIN";
export type OfficeRole = "EDITOR" | "MANAGER";

export const ROLE_RANK = {
  USER: 0,
  EDITOR: 1,
  MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
} as const;

export type RankName = keyof typeof ROLE_RANK;

export function globalRank(role: GlobalRole): number {
  return ROLE_RANK[role] ?? 0;
}

export function officeRank(grant: OfficeRole | null | undefined): number {
  return grant ? ROLE_RANK[grant] : 0;
}

/** 某人在某办公室的有效等级 = max(全局角色, 办公室授权)。 */
export function effectiveOfficeRank(globalRole: GlobalRole, grant: OfficeRole | null | undefined): number {
  return Math.max(globalRank(globalRole), officeRank(grant));
}

export const isAdmin = (role: GlobalRole): boolean => globalRank(role) >= ROLE_RANK.ADMIN;
export const isSuperAdmin = (role: GlobalRole): boolean => role === "SUPER_ADMIN";

export interface OfficeCapabilities {
  /** 有效等级（见 ROLE_RANK）。 */
  rank: number;
  /** 分配/释放/移动/交换座位、本办公室内维护员工。 */
  canAssign: boolean;
  /** 编辑楼层布局、导入、上传底图。 */
  canEditLayout: boolean;
  /** 授予/撤销 EDITOR。 */
  canGrantEditor: boolean;
  /** 授予/撤销 MANAGER、编辑/删除办公室。 */
  canManageOffice: boolean;
}

export function officeCapabilities(globalRole: GlobalRole, grant: OfficeRole | null | undefined): OfficeCapabilities {
  const rank = effectiveOfficeRank(globalRole, grant);
  return {
    rank,
    canAssign: rank >= ROLE_RANK.EDITOR,
    canEditLayout: rank >= ROLE_RANK.MANAGER,
    canGrantEditor: rank >= ROLE_RANK.MANAGER,
    canManageOffice: rank >= ROLE_RANK.ADMIN,
  };
}

/** 一个 rank 是否满足要求。 */
export function meets(rank: number, need: RankName): boolean {
  return rank >= ROLE_RANK[need];
}
