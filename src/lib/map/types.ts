/**
 * 楼层地图的数据形状（前后端共用）。
 *
 * 坐标：整数厘米，y 向下。矩形元素的 (x, y) 是未旋转时的左上角，rotation（度）绕矩形中心旋转。
 * Seat / Zone 各自落表；Wall / Door / Label / Furniture 存在 Floor.decor（JSON）。
 */
export type Id = string;

export type SeatStatus = "ACTIVE" | "RESERVED" | "DISABLED";
/** 展示状态：空闲 / 已用 / 预留 / 停用 */
export type SeatState = "free" | "occupied" | "reserved" | "disabled";

export interface Placed {
  id: Id;
  x: number;
  y: number;
  rotation: number;
}

export interface SeatEl extends Placed {
  kind: "seat";
  code: string;
  w: number;
  h: number;
  zoneId: Id | null;
  status: SeatStatus;
  note: string;
  employeeId: Id | null;
}

export type ZoneGeometry =
  | { type: "rect"; x: number; y: number; w: number; h: number; rotation?: number }
  | { type: "polygon"; points: [number, number][] };

export interface ZoneEl {
  kind: "zone";
  id: Id;
  name: string;
  departmentId: Id | null;
  /** 覆盖部门颜色；空则用部门色，再没有则用默认灰。 */
  color: string | null;
  geometry: ZoneGeometry;
  sortOrder: number;
}

export interface WallEl {
  kind: "wall";
  id: Id;
  points: [number, number][];
  thickness: number;
}

export interface DoorEl extends Placed {
  kind: "door";
  w: number;
  flip: boolean;
}

export interface LabelEl extends Placed {
  kind: "label";
  text: string;
  fontSize: number;
  color: string | null;
}

export type FurnitureType =
  | "meeting"
  | "pantry"
  | "printer"
  | "elevator"
  | "stairs"
  | "restroom"
  | "storage"
  | "reception"
  | "custom";

export interface FurnitureEl extends Placed {
  kind: "furniture";
  type: FurnitureType;
  w: number;
  h: number;
  name: string;
}

export type DecorElement = WallEl | DoorEl | LabelEl | FurnitureEl;
export type MapElement = SeatEl | ZoneEl | DecorElement;
export type ElementKind = MapElement["kind"];

/** 楼层底图：按厘米放置的一张图片。 */
export interface BackgroundImage {
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  locked: boolean;
}

export interface FloorDecor {
  schemaVersion: 1;
  background: BackgroundImage | null;
  /** z 序 = 数组顺序 */
  elements: DecorElement[];
}

export const EMPTY_DECOR: FloorDecor = { schemaVersion: 1, background: null, elements: [] };

export interface FloorMeta {
  id: Id;
  officeId: Id;
  name: string;
  width: number;
  height: number;
  gridSize: number;
  backgroundKey: string | null;
  version: number;
}

export interface EmployeeSummary {
  id: Id;
  employeeNo: string;
  name: string;
  departmentId: Id | null;
  team: string;
  title: string;
  isActive: boolean;
}

export interface DepartmentSummary {
  id: Id;
  name: string;
  color: string;
}

/** 2D / 3D 渲染器共同消费的一层数据。 */
export interface FloorScene {
  floor: FloorMeta;
  seats: SeatEl[];
  zones: ZoneEl[];
  decor: FloorDecor;
  employees: Record<Id, EmployeeSummary>;
  departments: Record<Id, DepartmentSummary>;
}

export function seatState(seat: Pick<SeatEl, "status" | "employeeId">): SeatState {
  if (seat.status === "DISABLED") return "disabled";
  if (seat.status === "RESERVED") return "reserved";
  return seat.employeeId ? "occupied" : "free";
}

export const FURNITURE_LABELS: Record<FurnitureType, string> = {
  meeting: "会议室",
  pantry: "茶水间",
  printer: "打印机",
  elevator: "电梯",
  stairs: "楼梯",
  restroom: "卫生间",
  storage: "储物间",
  reception: "前台",
  custom: "自定义",
};

export const DEFAULT_SEAT_SIZE = { w: 120, h: 60 } as const;
