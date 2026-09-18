/** ObjectType 行 → API 返回的摘要 */
export function toSummary(t: { id: string; key: string; name: string; category: string; w: number; d: number; h: number; spec: unknown; thumbnailKey: string | null; isActive: boolean; createdAt: Date }) {
  return { id: t.id, key: t.key, name: t.name, category: t.category, w: t.w, d: t.d, h: t.h, spec: t.spec, thumbnailKey: t.thumbnailKey, isActive: t.isActive, createdAt: t.createdAt.toISOString() };
}

