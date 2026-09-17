import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/auth/guards";

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId?: string | null;
  officeId?: string | null;
  floorId?: string | null;
  before?: unknown;
  after?: unknown;
  summary: string;
  batchId?: string | null;
}

export type Db = Prisma.TransactionClient | typeof prisma;

function toJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.JsonNull;
  return v as Prisma.InputJsonValue;
}

function toRow(actor: Actor, e: AuditEntry) {
  return {
    actorId: actor.id,
    actorW3Id: actor.w3Id,
    actorName: actor.name,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId ?? null,
    officeId: e.officeId ?? null,
    floorId: e.floorId ?? null,
    before: toJson(e.before),
    after: toJson(e.after),
    summary: e.summary,
    batchId: e.batchId ?? null,
  };
}

export async function writeAudit(db: Db, actor: Actor, e: AuditEntry): Promise<void> {
  await db.auditLog.create({ data: toRow(actor, e) });
}

export async function writeAuditMany(db: Db, actor: Actor, entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await db.auditLog.createMany({ data: entries.map((e) => toRow(actor, e)) });
}

export function newBatchId(): string {
  return crypto.randomUUID();
}
