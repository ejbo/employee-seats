/**
 * 开发种子数据：2 个办公室 × 2 层、部门、员工、座位与落座、1 个开发超管。
 * 幂等：按唯一键 upsert，可重复执行；每次执行会重置所有座位的落座。生产环境需 --force。
 *
 *   pnpm db:seed
 */
import { config as dotenv } from "dotenv";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { accountMatchKey } from "../src/lib/employee-key";
import { paletteColor } from "../src/lib/map/colors";
import type { FloorDecor, ZoneGeometry } from "../src/lib/map/types";
import { rectToPoints } from "../src/lib/map/rectilinear";

dotenv({ path: ".env.local", override: false });
dotenv({ path: ".env", override: false });

if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
  console.error("拒绝在生产环境写入种子数据（如确需，加 --force）。");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// 确定性伪随机，保证每次种子一致
let seed = 20260917;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

const SURNAMES = ["王", "李", "张", "刘", "陈", "杨", "黄", "赵", "周", "吴", "徐", "孙", "马", "朱", "胡", "郭", "何", "林", "罗", "高"];
const GIVEN = ["伟", "芳", "娜", "敏", "静", "磊", "洋", "勇", "艳", "杰", "涛", "明", "超", "秀英", "霞", "平", "刚", "桂英", "鹏", "婷", "子轩", "雨欣", "浩然", "欣怡"];
const TITLES = ["软件工程师", "高级工程师", "测试工程师", "产品经理", "项目经理", "架构师", "运营专员", "行政专员"];

const DEPARTMENTS = ["研发一部", "研发二部", "测试部", "产品部", "运营部", "行政部"];

interface OfficeSpec {
  institute: string;
  city: string;
  name: string;
  address: string;
  floors: { name: string; cols: number; rows: number; zoneDepts: string[] }[];
}

const OFFICES: OfficeSpec[] = [
  {
    institute: "中央研究院",
    city: "深圳",
    name: "坂田基地 J 区",
    address: "深圳市龙岗区坂田华为基地 J1 栋",
    floors: [
      { name: "3F", cols: 8, rows: 6, zoneDepts: ["研发一部", "测试部", "产品部"] },
      { name: "4F", cols: 8, rows: 6, zoneDepts: ["研发二部", "运营部", "行政部"] },
    ],
  },
  {
    institute: "南京研究所",
    city: "南京",
    name: "雨花台园区 A 栋",
    address: "南京市雨花台区软件大道 101 号 A 栋",
    floors: [
      { name: "5F", cols: 6, rows: 4, zoneDepts: ["研发一部", "研发二部"] },
      { name: "6F", cols: 6, rows: 4, zoneDepts: ["测试部", "产品部"] },
    ],
  },
];

const SEAT_W = 120;
const SEAT_H = 60;
const DX = 180;
const DY = 140;
const X0 = 300;
const Y0 = 300;

function buildDecor(width: number, height: number): FloorDecor {
  const inset = 100;
  const doorW = 90;
  return {
    schemaVersion: 2,
    background: null,
    elements: [
      {
        kind: "wall",
        id: "wall-outer",
        thickness: 20,
        points: [
          [inset, inset],
          [width - inset, inset],
          [width - inset, height - inset],
          [inset, height - inset],
          [inset, inset],
        ],
      },
      { kind: "room", id: "room-meeting", name: "会议室 A", type: "meeting", points: rectToPoints(width - 900, 300, 700, 450), floorStyle: null, wallHeight: null },
      { kind: "room", id: "room-pantry", name: "茶水间", type: "pantry", points: rectToPoints(width - 900, 850, 400, 300), floorStyle: null, wallHeight: null },
      { kind: "room", id: "room-elevator", name: "电梯厅", type: "elevator", points: rectToPoints(width - 500, height - 500, 300, 250), floorStyle: null, wallHeight: null },
      { kind: "furniture", id: "printer-1", typeKey: "printer", typeId: null, x: width - 400, y: 900, rotation: 0, w: 60, h: 60, name: "", flip: false },
      { kind: "furniture", id: "plant-1", typeKey: "plant", typeId: null, x: width - 1000, y: 320, rotation: 0, w: 50, h: 50, name: "", flip: false },
      // 底边墙段是外墙第 3 段（从右下角到左下角），门居中
      { kind: "door", id: "door-main", anchor: { kind: "wall", wallId: "wall-outer", segIndex: 2 }, offset: width - inset - width / 2 - doorW / 2, w: doorW, swing: "in", hinge: "start" },
      { kind: "label", id: "label-entry", x: width / 2 - 100, y: height - 260, rotation: 0, text: "入口", fontSize: 32, color: null },
    ],
  };
}

async function main() {
  // 开发种子 = 重置演示数据：先清空所有落座，避免与手工分配冲突（一人一座唯一约束）
  await prisma.seat.updateMany({ data: { employeeId: null } });

  // 部门
  const deptByName = new Map<string, string>();
  for (const [i, name] of DEPARTMENTS.entries()) {
    const d = await prisma.department.upsert({
      where: { name },
      update: { sortOrder: i },
      create: { name, color: paletteColor(i), sortOrder: i },
    });
    deptByName.set(name, d.id);
  }

  // 员工（工号 8 位，前 2 位固定，少数带 z 前缀表示外包）
  const employees: { id: string; departmentId: string }[] = [];
  for (let i = 0; i < 120; i++) {
    const num = String(10000000 + 1000 + i * 7);
    const employeeNo = i % 9 === 0 ? `z${num}` : num;
    const key = accountMatchKey(employeeNo)!;
    const deptName = DEPARTMENTS[i % DEPARTMENTS.length];
    const departmentId = deptByName.get(deptName)!;
    const name = `${pick(SURNAMES)}${pick(GIVEN)}`;
    const e = await prisma.employee.upsert({
      where: { employeeKey: key },
      update: { departmentId },
      create: {
        employeeNo,
        employeeKey: key,
        name,
        departmentId,
        title: pick(TITLES),
        team: `${deptName.slice(0, 2)}${(i % 3) + 1}组`,
        email: `${employeeNo}@huawei.com`,
      },
    });
    employees.push({ id: e.id, departmentId });
  }

  // 办公室 / 楼层 / 区域 / 座位
  let cursor = 0;
  for (const [oi, spec] of OFFICES.entries()) {
    const office = await prisma.office.upsert({
      where: { institute_city_name: { institute: spec.institute, city: spec.city, name: spec.name } },
      update: { address: spec.address, sortOrder: oi },
      create: { institute: spec.institute, city: spec.city, name: spec.name, address: spec.address, sortOrder: oi },
    });

    for (const [fi, fs] of spec.floors.entries()) {
      const width = fs.cols >= 8 ? 3200 : 2600;
      const height = fs.rows >= 6 ? 1800 : 1500;
      const decor = buildDecor(width, height) as unknown as Prisma.InputJsonValue;
      const floor = await prisma.floor.upsert({
        where: { officeId_name: { officeId: office.id, name: fs.name } },
        update: { sortOrder: fi, width, height, decor },
        create: { officeId: office.id, name: fs.name, sortOrder: fi, width, height, gridSize: 20, decor },
      });

      // 区域：把行平均分给 zoneDepts
      const rowsPerZone = Math.ceil(fs.rows / fs.zoneDepts.length);
      const zoneIds: string[] = [];
      for (const [zi, deptName] of fs.zoneDepts.entries()) {
        const r0 = zi * rowsPerZone;
        const r1 = Math.min(fs.rows, r0 + rowsPerZone);
        if (r0 >= fs.rows) break;
        const geometry: ZoneGeometry = {
          type: "rect",
          x: X0 - 40,
          y: Y0 + r0 * DY - 40,
          w: fs.cols * DX - (DX - SEAT_W) + 80,
          h: (r1 - r0) * DY - (DY - SEAT_H) + 80,
        };
        const zoneName = `${deptName}区`;
        const existing = await prisma.zone.findFirst({ where: { floorId: floor.id, name: zoneName } });
        const zone = existing
          ? await prisma.zone.update({ where: { id: existing.id }, data: { geometry: geometry as unknown as Prisma.InputJsonValue } })
          : await prisma.zone.create({
              data: {
                floorId: floor.id,
                name: zoneName,
                departmentId: deptByName.get(deptName)!,
                geometry: geometry as unknown as Prisma.InputJsonValue,
                sortOrder: zi,
              },
            });
        zoneIds.push(zone.id);
      }

      for (let r = 0; r < fs.rows; r++) {
        const zoneIdx = Math.min(zoneIds.length - 1, Math.floor(r / rowsPerZone));
        for (let c = 0; c < fs.cols; c++) {
          const code = `${String.fromCharCode(65 + r)}${String(c + 1).padStart(2, "0")}`;
          // 约 80% 落座，留一些空位；每层第一个座位预留、最后一个停用
          const isFirst = r === 0 && c === 0;
          const isLast = r === fs.rows - 1 && c === fs.cols - 1;
          const status = isFirst ? "RESERVED" : isLast ? "DISABLED" : "ACTIVE";
          let employeeId: string | null = null;
          if (status === "ACTIVE" && rand() < 0.8 && cursor < employees.length) {
            employeeId = employees[cursor++].id;
          }
          await prisma.seat.upsert({
            where: { floorId_code: { floorId: floor.id, code } },
            update: { x: X0 + c * DX, y: Y0 + r * DY, zoneId: zoneIds[zoneIdx] ?? null, status, employeeId },
            create: {
              floorId: floor.id,
              officeId: office.id,
              zoneId: zoneIds[zoneIdx] ?? null,
              code,
              x: X0 + c * DX,
              y: Y0 + r * DY,
              w: SEAT_W,
              h: SEAT_H,
              rotation: 0,
              status,
              employeeId,
            },
          });
        }
      }
    }
  }

  // 开发超管（与 .env.local 的 SUPER_ADMIN_W3_IDS 一致）
  await prisma.user.upsert({
    where: { huaweiW3Id: "00000001" },
    update: { role: "SUPER_ADMIN" },
    create: { huaweiW3Id: "00000001", huaweiW3Name: "开发管理员", displayName: "开发管理员", role: "SUPER_ADMIN" },
  });

  const counts = {
    departments: await prisma.department.count(),
    employees: await prisma.employee.count(),
    offices: await prisma.office.count(),
    floors: await prisma.floor.count(),
    zones: await prisma.zone.count(),
    seats: await prisma.seat.count(),
    seated: await prisma.seat.count({ where: { employeeId: { not: null } } }),
  };
  console.log("种子完成：", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
