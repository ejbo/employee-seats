/**
 * 物件库 key → 随仓库分发的 glTF（Kenney Furniture Kit，CC0）。
 * 模型用 meshopt 压缩（解码器随 three-stdlib 内置，不访问外网）；缺件回退到程序化规格。
 */
export const GLB_PROPS: Record<string, string> = {
  chair: "/models/chairDesk.glb",
  "desk-straight": "/models/desk.glb",
  "desk-l": "/models/deskCorner.glb",
  monitor: "/models/computerScreen.glb",
  "sofa-2": "/models/loungeSofa.glb",
  "sofa-3": "/models/loungeSofaLong.glb",
  armchair: "/models/loungeChair.glb",
  "coffee-table": "/models/tableCoffee.glb",
  cabinet: "/models/bookcaseClosedDoors.glb",
  locker: "/models/bookcaseClosed.glb",
  bookshelf: "/models/bookcaseOpen.glb",
  "tv-screen": "/models/televisionModern.glb",
  plant: "/models/pottedPlant.glb",
  "meeting-table-6": "/models/table.glb",
  "meeting-table-8": "/models/table.glb",
  "round-table-4": "/models/tableRound.glb",
  fridge: "/models/kitchenFridge.glb",
  "reception-counter": "/models/kitchenBar.glb",
};

export function glbFor(typeKey: string): string | null {
  return GLB_PROPS[typeKey] ?? null;
}
