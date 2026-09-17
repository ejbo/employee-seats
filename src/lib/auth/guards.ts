import "server-only";
import { cache as reactCache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loginHref } from "@/lib/auth/callback-path";
import { json } from "@/lib/api";
import {
  ROLE_RANK,
  globalRank,
  officeCapabilities,
  type GlobalRole,
  type OfficeCapabilities,
  type OfficeRole,
} from "@/lib/permissions";

/** 当前登录者（角色/停用标记以数据库为准，每个请求只查一次）。 */
export interface Actor {
  id: string;
  w3Id: string;
  name: string;
  role: GlobalRole;
}

const memo: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof reactCache === "function" ? reactCache : (fn) => fn;

export const getActor = memo(async (): Promise<Actor | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const row = await prisma.user.findUnique({
    where: { id },
    select: { id: true, huaweiW3Id: true, displayName: true, role: true, isActive: true },
  });
  if (!row || !row.isActive) return null;
  return { id: row.id, w3Id: row.huaweiW3Id, name: row.displayName, role: row.role };
});

/**
 * 匿名访客该去哪登录、登录后回到哪。`x-pathname` 由 src/proxy.ts 写入（不含 basePath、
 * 含查询串），布局组件没有别的办法知道自己在守哪个路径；`fallback` 给知道自己路由的页面用。
 */
async function loginRedirectHref(fallback?: string): Promise<string> {
  const h = await headers();
  return loginHref(h.get("x-pathname") ?? fallback ?? null);
}

/** 登录墙：未登录 → 登录页（带回跳）。 */
export async function requireUser(fallback?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(await loginRedirectHref(fallback));
  return actor;
}

/** 全局角色门禁：不够 → 首页并提示。 */
export async function requireRole(min: "ADMIN" | "SUPER_ADMIN", fallback?: string): Promise<Actor> {
  const actor = await requireUser(fallback);
  if (globalRank(actor.role) < ROLE_RANK[min]) redirect(`/?denied=${min.toLowerCase()}`);
  return actor;
}

export async function officeGrant(userId: string, officeId: string): Promise<OfficeRole | null> {
  const g = await prisma.officePermission.findUnique({
    where: { userId_officeId: { userId, officeId } },
    select: { role: true },
  });
  return g?.role ?? null;
}

/** 某人在某办公室能做什么（ADMIN 及以上不查授权表）。 */
export async function loadOfficeCapabilities(actor: Actor, officeId: string): Promise<OfficeCapabilities> {
  const grant = globalRank(actor.role) >= ROLE_RANK.ADMIN ? null : await officeGrant(actor.id, officeId);
  return officeCapabilities(actor.role, grant);
}

/** 页面级办公室门禁。 */
export async function requireOfficeAccess(
  officeId: string,
  need: OfficeRole,
  fallback?: string,
): Promise<{ actor: Actor; caps: OfficeCapabilities }> {
  const actor = await requireUser(fallback);
  const caps = await loadOfficeCapabilities(actor, officeId);
  if (caps.rank < ROLE_RANK[need]) redirect(`/offices/${officeId}?denied=${need.toLowerCase()}`);
  return { actor, caps };
}

export type ApiGate =
  | { ok: true; actor: Actor; caps: OfficeCapabilities | null }
  | { ok: false; response: Response };

/**
 * API 路由门禁：
 *   const gate = await gateApi({ office: officeId, need: "MANAGER" });
 *   if (!gate.ok) return gate.response;
 */
export async function gateApi(
  opts: { role?: "ADMIN" | "SUPER_ADMIN"; office?: string | null; need?: OfficeRole } = {},
): Promise<ApiGate> {
  const actor = await getActor();
  if (!actor) return { ok: false, response: json(401, { error: "unauthenticated" }) };
  if (opts.role && globalRank(actor.role) < ROLE_RANK[opts.role]) {
    return { ok: false, response: json(403, { error: "forbidden", need: opts.role }) };
  }
  let caps: OfficeCapabilities | null = null;
  if (opts.office) {
    caps = await loadOfficeCapabilities(actor, opts.office);
    const need = opts.need ?? "EDITOR";
    if (caps.rank < ROLE_RANK[need]) {
      return { ok: false, response: json(403, { error: "forbidden", need, officeId: opts.office }) };
    }
  }
  return { ok: true, actor, caps };
}

/** 维护花名册（新建/编辑员工）：ADMIN，或在任一办公室有授权（EDITOR 及以上）。 */
export async function canManageEmployees(actor: Actor): Promise<boolean> {
  if (globalRank(actor.role) >= ROLE_RANK.ADMIN) return true;
  const n = await prisma.officePermission.count({ where: { userId: actor.id } });
  return n > 0;
}

/** 员工离职/复职：ADMIN；或其所在办公室的 MANAGER；未落座时任一办公室的 MANAGER。 */
export async function canDeactivateEmployee(actor: Actor, seatOfficeId: string | null): Promise<boolean> {
  if (globalRank(actor.role) >= ROLE_RANK.ADMIN) return true;
  if (seatOfficeId) return (await officeGrant(actor.id, seatOfficeId)) === "MANAGER";
  const n = await prisma.officePermission.count({ where: { userId: actor.id, role: "MANAGER" } });
  return n > 0;
}
