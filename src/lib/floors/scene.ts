import "server-only";
import { prisma } from "@/lib/db";
import { parseDecor, zoneGeometrySchema } from "@/lib/map/schema";
import type { EmployeeSummary, FloorScene, SeatEl, ZoneEl } from "@/lib/map/types";

export interface FloorPageData {
  scene: FloorScene;
  office: { id: string; name: string; institute: string; city: string };
  /** 同办公室的其他楼层（用于切换） */
  floors: { id: string; name: string }[];
  /** 本办公室未落座的在职员工（分配模式用） */
  unassigned: EmployeeSummary[];
}

const employeeSelect = {
  id: true,
  employeeNo: true,
  name: true,
  departmentId: true,
  team: true,
  title: true,
  isActive: true,
} as const;

export async function loadFloorPageData(floorId: string): Promise<FloorPageData | null> {
  const floor = await prisma.floor.findUnique({
    where: { id: floorId },
    include: {
      office: {
        select: {
          id: true,
          name: true,
          institute: true,
          city: true,
          floors: { select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        },
      },
      zones: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      seats: { include: { employee: { select: employeeSelect } }, orderBy: { code: "asc" } },
    },
  });
  if (!floor) return null;

  const [departments, unassigned] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true, color: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.employee.findMany({
      where: { isActive: true, seat: null },
      select: employeeSelect,
      orderBy: [{ name: "asc" }],
      take: 2000,
    }),
  ]);

  const employees: Record<string, EmployeeSummary> = {};
  const seats: SeatEl[] = floor.seats.map((s) => {
    if (s.employee) employees[s.employee.id] = s.employee;
    return {
      kind: "seat",
      id: s.id,
      code: s.code,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      rotation: s.rotation,
      zoneId: s.zoneId,
      status: s.status,
      note: s.note,
      employeeId: s.employeeId,
      style: (["desk-basic", "desk-l", "desk-l-left", "bench"].includes(s.style) ? s.style : "desk-basic") as SeatEl["style"],
    };
  });
  const zones: ZoneEl[] = [];
  for (const z of floor.zones) {
    const g = zoneGeometrySchema.safeParse(z.geometry);
    if (!g.success) continue;
    zones.push({ kind: "zone", id: z.id, name: z.name, departmentId: z.departmentId, color: z.color, geometry: g.data, sortOrder: z.sortOrder });
  }

  return {
    scene: {
      floor: {
        id: floor.id,
        officeId: floor.officeId,
        name: floor.name,
        width: floor.width,
        height: floor.height,
        gridSize: floor.gridSize,
        backgroundKey: floor.backgroundKey,
        version: floor.version,
      },
      seats,
      zones,
      decor: parseDecor(floor.decor),
      employees,
      departments: Object.fromEntries(departments.map((d) => [d.id, d])),
    },
    office: { id: floor.office.id, name: floor.office.name, institute: floor.office.institute, city: floor.office.city },
    floors: floor.office.floors,
    unassigned,
  };
}
