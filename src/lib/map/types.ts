/**
 * 楼层地图的数据形状（前后端共用）。schemaVersion 2。
 *
 * 坐标：整数厘米，y 向下。矩形元素的 (x, y) 是未旋转时的左上角，rotation（度）绕矩形中心旋转。
 * Seat / Zone 各自落表；Room / Wall / Door / Label / Furniture 存在 Floor.decor（JSON）。
 * 墙由房间边界派生（src/lib/map/walls.ts），WallEl 只用于独立墙 / 斜墙。
 */
import type { ObjectSpec } from "./object-spec";

export type Id = string;

export type SeatStatus = "ACTIVE" | "RESERVED" | "DISABLED";
/** 展示状态：空闲 / 已用 / 预留 / 停用 */
export type SeatState = "free" | "occupied" | "reserved" | "disabled";
export type SeatStyle = "desk-basic" | "desk-l" | "desk-l-left" | "bench";

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
  rotation: number;
  zoneId: Id | null;
  status: SeatStatus;
  note: string;
  employeeId: Id | null;
  style: SeatStyle;
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

// ── 房间 ────────────────────────────────────────────────────────────────────
export type RoomType = "office" | "meeting" | "pantry" | "restroom" | "elevator" | "stairs" | "storage" | "reception" | "corridor" | "other";
export type FloorStyle = "plain" | "tile" | "wood" | "carpet";

/** 房间：直角多边形（每条边水平或垂直），顺时针（屏幕坐标），不旋转。走廊不生成墙。 */
export interface RoomEl {
  kind: "room";
  id: Id;
  name: string;
  type: RoomType;
  points: [number, number][];
  floorStyle: FloorStyle | null;
  /** 3D 墙高（cm），空 = 默认 */
  wallHeight: number | null;
}

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  office: "办公区",
  meeting: "会议室",
  pantry: "茶水间",
  restroom: "卫生间",
  elevator: "电梯厅",
  stairs: "楼梯",
  storage: "储物间",
  reception: "前台",
  corridor: "走廊",
  other: "其他",
};

export const FLOOR_STYLE_LABELS: Record<FloorStyle, string> = { plain: "素色", tile: "瓷砖", wood: "木地板", carpet: "地毯" };

/** 房间类型默认地面 */
export const DEFAULT_FLOOR_STYLE: Record<RoomType, FloorStyle> = {
  office: "carpet",
  meeting: "wood",
  pantry: "tile",
  restroom: "tile",
  elevator: "plain",
  stairs: "plain",
  storage: "plain",
  reception: "wood",
  corridor: "plain",
  other: "plain",
};

// ── 墙 / 门 ─────────────────────────────────────────────────────────────────
export interface WallEl {
  kind: "wall";
  id: Id;
  points: [number, number][];
  thickness: number;
}

export type DoorAnchor = { kind: "room"; roomId: Id; edgeIndex: number } | { kind: "wall"; wallId: Id; segIndex: number };

/** 门锚定在房间的某条边或某段墙上：offset = 自边起点沿边的距离（cm）。 */
export interface DoorEl {
  kind: "door";
  id: Id;
  anchor: DoorAnchor;
  offset: number;
  w: number;
  /** 开向：in = 朝房间内（墙的右手/内侧），out = 朝外 */
  swing: "in" | "out";
  hinge: "start" | "end";
}

export interface LabelEl extends Placed {
  kind: "label";
  text: string;
  fontSize: number;
  color: string | null;
}

/** 物件：引用物件库 typeKey（内置）或 typeId（自定义，数据库）。 */
export interface FurnitureEl extends Placed {
  kind: "furniture";
  typeKey: string;
  typeId: Id | null;
  w: number;
  h: number;
  name: string;
  flip: boolean;
}

export type DecorElement = RoomEl | WallEl | DoorEl | LabelEl | FurnitureEl;
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
  schemaVersion: 2;
  background: BackgroundImage | null;
  /** z 序 = 数组顺序 */
  elements: DecorElement[];
}

export const EMPTY_DECOR: FloorDecor = { schemaVersion: 2, background: null, elements: [] };

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

/** 自定义物件（数据库 ObjectType）在场景里的摘要 */
export interface ObjectTypeSummary {
  id: Id;
  name: string;
  category: string;
  w: number;
  d: number;
  h: number;
  spec: ObjectSpec;
}

/** 2D / 3D 渲染器共同消费的一层数据。 */
export interface FloorScene {
  floor: FloorMeta;
  seats: SeatEl[];
  zones: ZoneEl[];
  decor: FloorDecor;
  employees: Record<Id, EmployeeSummary>;
  departments: Record<Id, DepartmentSummary>;
  objectTypes?: Record<Id, ObjectTypeSummary>;
}

export function seatState(seat: Pick<SeatEl, "status" | "employeeId">): SeatState {
  if (seat.status === "DISABLED") return "disabled";
  if (seat.status === "RESERVED") return "reserved";
  return seat.employeeId ? "occupied" : "free";
}

export const SEAT_STYLE_LABELS: Record<SeatStyle, string> = {
  "desk-basic": "直桌",
  "desk-l": "L 形桌（右）",
  "desk-l-left": "L 形桌（左）",
  bench: "长条工位",
};

export const DEFAULT_SEAT_SIZE = { w: 120, h: 60 } as const;
export const WALL_THICKNESS = 12;
export const DEFAULT_WALL_HEIGHT = 240;
export const DEFAULT_DOOR_WIDTH = 90;
