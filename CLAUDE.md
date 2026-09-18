@AGENTS.md

# 座位图（employee-seats）— 项目备忘

内网办公室座位图：Next.js 16 / React 19.2（锁定 <19.3，R3F 要求）/ Tailwind v4 / Prisma 7 + Postgres（schema `employee_seats`）/ Auth.js v5 + 华为 SSO。中文 UI，无 i18n。设计：v1 `docs/plan.md`，v2（房间 / 蓝图 / 3D / AI）`docs/plan-v2.md`；部署见 `docs/deploy.md`。

## 常用命令

`pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm db:migrate` / `db:seed` / `db:deploy` · `pnpm preflight` · `NEXT_BASE_PATH=/seats pnpm build`

本地：`.env.local` 里 `ENABLE_SSO=false ENABLE_DEV_LOGIN=true`，登录页用工号 `00000001`（`SUPER_ADMIN_W3_IDS`）即超管。本机 Postgres 是 EDB 18（`/Library/PostgreSQL/18`），数据库 `employee_seats`。

## 结构与约定

- 页面在 `src/app/(app)/`（`layout.tsx` 里 `requireUser()` 做登录墙）；API 全在 `src/app/api/**/route.ts`，每个处理器 `try { gateApi(...) … } catch (e) { return apiError(e) }`（`src/lib/api.ts`）。
- 门禁：`src/lib/auth/guards.ts`（`getActor` / `requireUser` / `requireRole` / `requireOfficeAccess` / `gateApi`），等级格在 `src/lib/permissions.ts`（USER < EDITOR < MANAGER < ADMIN < SUPER_ADMIN，ADMIN 隐含所有办公室 MANAGER）。办公室授权不进 JWT，每次改动请求查一次 `OfficePermission`。
- 边缘中间件 `src/proxy.ts` 只发布 `x-pathname`，绝不做鉴权（子路径 + 反代下读不到安全 cookie）。
- 工号匹配用 `accountMatchKey`（数字段；`z84412632` == `84412632`），`Employee.employeeKey` 唯一；SSO 不返回部门，部门只来自导入 / 手工。
- 座位编号在楼层内唯一（`@@unique([floorId, code])`）；一人一座（`Seat.employeeId @unique`）；移动 = 事务内先释放再分配。
- 地图坐标：整数厘米，y 向下，矩形绕中心旋转；`Seat`/`Zone` 落表，房间 / 墙 / 门 / 文字 / 物件在 `Floor.decor` JSON（`schemaVersion: 2`，`src/lib/map/schema.ts` 校验；读到 v1 由 `migrate.ts` 迁移，绝不能让旧楼层变空）。
- 房间 `RoomEl` 是直角多边形（顺时针、每边水平或垂直，`rectilinear.ts`）；墙不存储而是派生（`walls.ts::deriveWalls`，相邻房间共享边只画一次，门减去开口）；门 `DoorEl` 锚定在房间边 / 墙段上（`doors.ts::resolveDoor`），删除宿主时 store 级联删门；房间之间内部不能相交、共享边可以（`rooms.ts::overlappingRooms`）。
- 物件 `FurnitureEl.typeKey` 取自 `catalog.ts`（`custom` + `typeId` 指向 `ObjectType` 表，保存时校验存在且启用）；3D 规格是 `object-spec.ts` 的 DSL（cm、y 向上、原点脚印中心地面），内置规格在 `object-specs.ts`，渲染器 `map3d/procedural-object.tsx`（整层按 4 种单位几何体实例化）；glTF 道具映射 `glb-props.ts`，只用 meshopt（Draco 解码器会拉 CDN）。
- 编辑器几何操作统一走 `transform.ts`（门的平移 = 沿宿主边滑动 offset）；吸附 `snap.ts`（拖动前收集候选，⌥ 关、⇧ 锁轴）；批量 `batch.ts` / `renumber.ts` / `room-fill.ts`；跨楼层剪贴板 `stores/clipboard-store.ts`。
- LLM：`src/lib/llm`（env 决定 provider，内网网关直连、公网 `LLM_USE_PROXY=true`；回复一律 `extractJsonObject`，不用 response_format）；户型图 / 物件识别在 `src/lib/ai`，路由 `api/ai/**`，未配置返回 503 `ai_not_configured`，模型侧失败 502 `ai_failed` 带 message。
- 编辑器：`src/stores/editor-store.ts`（zustand + zundo，拖拽用瞬时 overrides，松手一次性 `patchMany` → 一步撤销）；保存走 `PUT /api/floors/[id]/layout { baseVersion, ops }`，`Floor.version` 乐观锁，409 `version_conflict` → 重新加载 / 强制覆盖。
- 分配模式的拖拽是自写的（`src/stores/drag-store.ts` + `use-drag-session.ts`），不是 dnd-kit：SVG 元素上 `data-seat-id`，`elementFromPoint` 找目标。
- 导入：`src/lib/import/{parse,diff,apply}.ts`，预览返回 `rows + diff.hash`，应用时事务内重算，hash 不等 → 409 `preview_stale`；错误整体阻断，警告放行。
- 子路径部署四件套都已就位：`AUTH_URL` 以 `/api/auth` 结尾、`AuthProvider basePath`、`src/lib/auth/handlers.ts` 补 basePath、客户端 `installApiBasePathFetch`；所有客户端 `fetch('/api/...')` 都走 `src/lib/api-client.ts`。
- 内网无外网：字体用 `geist` 包，3D 标签用 canvas 纹理（别用 drei `<Text>` 默认字体）。

## 测试与验证

- vitest：`tests/`（导入解析 / 差异、工号键、权限、布局 diff、SSO、decor 迁移、直角多边形、墙派生、房间、吸附、批量 / 编号、填充、LLM JSON、户型图整理、物件规格）。
- 浏览器验证用 Claude in Chrome：**WebGL（3D 视图）在后台标签页不会绘制，截图会超时 —— 不是代码问题**；验证 3D 需要标签页在前台。后台标签页久了会被 Chrome 节流（rAF/RO 不触发、定时器一分钟一次），出现「页面无响应」先开新标签页再判断。
- 内置 React Compiler lint 规则：effect 里不要同步 setState（用派生值或 `useSyncExternalStore`），渲染期间不要读 `ref.current`。
