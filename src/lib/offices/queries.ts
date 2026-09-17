import "server-only";
import { prisma } from "@/lib/db";

export interface FloorStats {
  total: number;
  occupied: number;
  reserved: number;
  disabled: number;
}

export interface FloorSummary extends FloorStats {
  id: string;
  name: string;
  sortOrder: number;
}

export interface OfficeSummary extends FloorStats {
  id: string;
  institute: string;
  city: string;
  name: string;
  address: string;
  description: string;
  sortOrder: number;
  floors: FloorSummary[];
}

const zero = (): FloorStats => ({ total: 0, occupied: 0, reserved: 0, disabled: 0 });

/** 每层的座位统计（一次 groupBy 拿全）。 */
export async function floorStatsMap(): Promise<Map<string, FloorStats>> {
  const rows = await prisma.seat.groupBy({
    by: ["floorId", "status"],
    _count: { _all: true },
  });
  const occupiedRows = await prisma.seat.groupBy({
    by: ["floorId"],
    where: { employeeId: { not: null } },
    _count: { _all: true },
  });
  const map = new Map<string, FloorStats>();
  for (const r of rows) {
    const s = map.get(r.floorId) ?? zero();
    s.total += r._count._all;
    if (r.status === "RESERVED") s.reserved += r._count._all;
    if (r.status === "DISABLED") s.disabled += r._count._all;
    map.set(r.floorId, s);
  }
  for (const r of occupiedRows) {
    const s = map.get(r.floorId) ?? zero();
    s.occupied = r._count._all;
    map.set(r.floorId, s);
  }
  return map;
}

/** 全部办公室 + 楼层 + 座位统计（侧栏、总览页）。 */
export async function listOfficesWithStats(): Promise<OfficeSummary[]> {
  const [offices, stats] = await Promise.all([
    prisma.office.findMany({
      orderBy: [{ institute: "asc" }, { city: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { floors: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, sortOrder: true } } },
    }),
    floorStatsMap(),
  ]);
  return offices.map((o) => {
    const floors: FloorSummary[] = o.floors.map((f) => ({ ...f, ...(stats.get(f.id) ?? zero()) }));
    const agg = floors.reduce(
      (acc, f) => ({
        total: acc.total + f.total,
        occupied: acc.occupied + f.occupied,
        reserved: acc.reserved + f.reserved,
        disabled: acc.disabled + f.disabled,
      }),
      zero(),
    );
    return {
      id: o.id,
      institute: o.institute,
      city: o.city,
      name: o.name,
      address: o.address,
      description: o.description,
      sortOrder: o.sortOrder,
      floors,
      ...agg,
    };
  });
}

export async function getOfficeSummary(id: string): Promise<OfficeSummary | null> {
  const all = await listOfficesWithStats();
  return all.find((o) => o.id === id) ?? null;
}

/** 研究所 → 城市 → 办公室 分组（保持排序）。 */
export interface OfficeGroup {
  institute: string;
  cities: { city: string; offices: OfficeSummary[] }[];
}

export function groupOffices(offices: OfficeSummary[]): OfficeGroup[] {
  const groups: OfficeGroup[] = [];
  for (const o of offices) {
    let g = groups.find((x) => x.institute === o.institute);
    if (!g) {
      g = { institute: o.institute, cities: [] };
      groups.push(g);
    }
    let c = g.cities.find((x) => x.city === o.city);
    if (!c) {
      c = { city: o.city, offices: [] };
      g.cities.push(c);
    }
    c.offices.push(o);
  }
  return groups;
}
