import "server-only";
import { prisma } from "@/lib/db";
import { normalizeSeatCode } from "@/lib/employee-key";

export interface SearchPerson {
  id: string;
  name: string;
  employeeNo: string;
  department: { name: string; color: string } | null;
  seat: { code: string; floorId: string; floorName: string; officeId: string; officeName: string } | null;
}
export interface SearchSeat {
  id: string;
  code: string;
  floorId: string;
  floorName: string;
  officeId: string;
  officeName: string;
  occupant: string | null;
}
export interface SearchOffice {
  id: string;
  name: string;
  city: string;
  institute: string;
}

export async function globalSearch(qRaw: string, limit = 8): Promise<{ people: SearchPerson[]; seats: SearchSeat[]; offices: SearchOffice[] }> {
  const q = qRaw.trim();
  if (!q) return { people: [], seats: [], offices: [] };
  const term = q.replace(/\s+/g, "");
  const digits = term.replace(/\D+/g, "");
  const code = normalizeSeatCode(term);

  const [people, seats, offices] = await Promise.all([
    prisma.employee.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { employeeNo: { contains: term, mode: "insensitive" } },
          ...(digits.length >= 3 ? [{ employeeKey: { contains: digits } }] : []),
        ],
      },
      take: limit,
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        employeeNo: true,
        department: { select: { name: true, color: true } },
        seat: { select: { code: true, floor: { select: { id: true, name: true, office: { select: { id: true, name: true } } } } } },
      },
    }),
    code.length >= 2
      ? prisma.seat.findMany({
          where: { code: { contains: code, mode: "insensitive" } },
          take: limit,
          orderBy: [{ code: "asc" }],
          select: {
            id: true,
            code: true,
            employee: { select: { name: true } },
            floor: { select: { id: true, name: true, office: { select: { id: true, name: true } } } },
          },
        })
      : Promise.resolve([]),
    prisma.office.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { city: { contains: term, mode: "insensitive" } },
          { institute: { contains: term, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, name: true, city: true, institute: true },
    }),
  ]);

  return {
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      employeeNo: p.employeeNo,
      department: p.department,
      seat: p.seat
        ? { code: p.seat.code, floorId: p.seat.floor.id, floorName: p.seat.floor.name, officeId: p.seat.floor.office.id, officeName: p.seat.floor.office.name }
        : null,
    })),
    seats: seats.map((s) => ({
      id: s.id,
      code: s.code,
      floorId: s.floor.id,
      floorName: s.floor.name,
      officeId: s.floor.office.id,
      officeName: s.floor.office.name,
      occupant: s.employee?.name ?? null,
    })),
    offices,
  };
}
