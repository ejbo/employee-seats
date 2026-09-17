# 员工座位图（employee-seats）实施计划

## 1. Context

行政/管理部门需要一个网页工具，随时查到「某位员工坐在哪」。现状是 Excel 座位表（座位编号 + 姓名 + 工号 + 部门），既不直观也难维护：人员串座、离职、新入职频繁，每个办公室的平面布局又都不一样。

目标：一个华为 SSO 登录的内网网站，把每个办公室做成可编辑的「地图」——授权人员像画平面图一样摆放工位/区域/墙体，员工信息可手工维护也可 Excel 批量导入并按座位编号直接落座；所有员工登录即可查看、搜人；同一份数据同时提供 2D 平面图和 3D 立体视图；按部门给区域一层淡淡的底色；权限分层（超级管理员 / 行政管理员 / 办公室管理员 / 办公室编辑 / 普通员工）。

项目目录 `/Users/jzl19991121/Projects/employee-seats` 目前为空（非 git 仓库），从零搭建。

## 2. 已确认的决策（来自问答）

| 决策 | 结论 |
|---|---|
| 编辑方式 | 自由画布 + 吸附网格，可选上传楼层平面图做底图；同一份数据驱动 2D 与 3D |
| 查看权限 | 所有 SSO 登录员工可查看/搜索；改动需授权 |
| 规模 | 十几个办公室，每层 < 200 座位 → SVG 渲染足够，Postgres |
| 导入 | 先按标准模板设计（座位编号 \| 工号 \| 姓名 \| 部门 \| 备注 …），支持中文列名别名 |
| 部署 | `https://cari.rnd.huawei.com/seats` 子路径；复用 ai-community 已注册的 SSO client（回调是已备案域名的子目录，D2 无需新备案）；同一 Postgres 实例独立 schema `employee_seats` |
| 员工自助认领座位 | v1 不做（列入后续） |
| 界面语言 | 仅中文，不引入 i18n 框架 |

## 3. 技术栈与版本（已核对 npm）

镜像 `multillm-chat` 的外壳 + `skills-community` 的 SSO/导入/部署件。pnpm，`src/` + `@/*` 别名，API 全部是 `src/app/api/**/route.ts`，服务端模块加 `import "server-only"`。

| 包 | 版本 | 备注 |
|---|---|---|
| next / react / react-dom | 16.3.x / **19.2.x（锁定）** | `@react-three/fiber@9.7.0` peer 是 `react >=19 <19.3`，不要装 19.3 |
| next-auth | 5.0.0-beta.32 | peer 支持 next ^16；JWT session，无 adapter |
| prisma / @prisma/client / @prisma/adapter-pg | **7.10.0（锁定）** | `prisma` 的 latest tag 目前是 8.0.0-rc，避开 |
| tailwindcss | 4.x | CSS-first `@theme inline`，`.dark` 类切换 |
| @react-three/fiber / drei / three | 9.7 / 10.7 / 0.186 | 3D 视图，`next/dynamic` 懒加载 |
| zustand / zundo | 5.x / 2.3 | 编辑器状态 + 撤销重做 |
| swr | 2.x | 数据获取、焦点重验、乐观更新 |
| @dnd-kit/core, @dnd-kit/utilities | 6.x / 3.x | 把员工拖到座位上 |
| exceljs | 4.4 | 生成导入模板 / 导出座位表（不用 SheetJS：npm 版 0.18.5 有未修 CVE） |
| jszip | 3.x | 复用 skills-community 的 xlsx 解析器 |
| zod 4, framer-motion 12, sonner, lucide-react, cva/clsx/tailwind-merge, Radix 原语, geist（离线字体）, vitest, tsx | — | 与现有项目一致；内网无外网，运行时/构建时都不能依赖 CDN（因此不用 `next/font/google`、不用 drei `<Text>` 默认字体） |

Next 16 注意：中间件文件是 `src/proxy.ts`（`export function proxy`），页面/路由的 `params` 是 Promise 需 `await`。

## 4. 数据模型（`prisma/schema.prisma`，schema = `employee_seats`）

复用 `/Users/jzl19991121/Projects/multillm-chat/prisma/schema.prisma` 的多 schema 隔离写法与 `src/lib/db.ts` 的 Prisma 7 + `PrismaPg` 单例；`DATABASE_URL` 带 `?schema=employee_seats` 让 `_prisma_migrations` 也落在应用 schema。

```prisma
enum GlobalRole { USER ADMIN SUPER_ADMIN }
enum OfficeRole { EDITOR MANAGER }
enum SeatStatus { ACTIVE RESERVED DISABLED }     // 已用/空闲由 employeeId 是否为空推导

User          id, huaweiW3Id @unique(工号), huaweiW3Name(SSO 中文名, 只写一次), displayName,
              email?, employeeType?, phone?, rawProfile Json?(首登保存), role GlobalRole, isActive,
              lastLoginAt?, employee Employee?, grants OfficePermission[]
Office        id, institute(研究所), city, name, address, description?, sortOrder   @@unique([institute, city, name])
Floor         id, officeId, name, sortOrder, width Int(cm, 默认 4000), height Int(默认 3000), gridSize Int(20),
              backgroundKey?, decor Json({ schemaVersion, background?, elements: DecorElement[] }),
              version Int(乐观锁)                                                   @@unique([officeId, name])
Zone          id, floorId, name, departmentId?, color?(覆盖部门色), geometry Json(rect | polygon), sortOrder
Department    id, name @unique, color, sortOrder                                     // 只为颜色稳定；导入时自动建
Employee      id, employeeNo(按导入原样, 如 z84412632), employeeKey @unique(数字段 84412632 = 身份键),
              name, departmentId?, team?, title?, email?, phone?, note?, isActive, leftAt?,
              userId? @unique(登录账号关联), seat Seat?                              @@index([name]) @@index([departmentId])
Seat          id, floorId, officeId(冗余), zoneId?, code(座位编号), x, y, w(120), h(60), rotation, status,
              note, employeeId? @unique(一人一座, DB 强约束)                         @@unique([floorId, code]) @@index([officeId, code])
OfficePermission  userId, officeId, role OfficeRole, grantedById?, createdAt        @@id([userId, officeId])
AuditLog      id, actorId?, actorW3Id, actorName, action('seat.assign'|'seat.release'|'seat.move'|'seat.swap'|
              'layout.save'|'import.apply'|'employee.*'|'permission.*'|'user.role'), targetType, targetId?,
              officeId?, floorId?, before Json?, after Json?, summary, batchId?, createdAt
```

要点：研究所/城市作为 Office 的字段（侧栏按研究所→城市→办公室分组），不另建两张小表；座位编号在**楼层内唯一**，导入时在办公室范围内按编号查找，若多个楼层撞号则报 `ambiguous_seat` 要求补「楼层」列；「串座」= 一个事务里 release + assign；座位历史由 AuditLog（`targetType='seat'` + before/after + batchId）回答，不另建历史表。

## 5. 登录与权限

### 5.1 华为 SSO（Auth.js v5 自定义 provider）—— 从 skills-community 拷贝

| 来源 `/Users/jzl19991121/Projects/skills-community/` | 目标 | 处理 |
|---|---|---|
| `lib/auth/huawei-fetch.ts`（`createHuaweiFetch`：JSON token body / 补 `token_type` / userinfo 改 POST） | `src/lib/auth/huawei-fetch.ts` | 原样 |
| `lib/auth.ts`（provider `checks:['state']`、`customFetch`、`profile()`、basePath 钉死、`useSecureCookies`） | `src/lib/auth/index.ts` | 去掉密码登录/Role 表/限流；`profile()` 额外带 `nameEn/employeeType/phone/raw` |
| `lib/auth/cookies.ts`、`lib/auth/callback-path.ts`（`sanitizeCallbackPath`/`loginHref`） | `src/lib/auth/` | cookie 前缀改 `seats.` |
| `lib/auth-handlers.ts`（补回被 Next 剥掉的 basePath） + `app/api/auth/[...nextauth]/route.ts` | `src/lib/auth/handlers.ts` + 同路径 route | 原样 |
| `components/AuthProvider.tsx`、`lib/base-path.ts`（`withBasePath`）、`lib/patch-fetch.ts`（`installApiBasePathFetch`） | `src/components/auth-provider.tsx`、`src/lib/` | 原样（子路径部署必需） |
| `middleware.ts`（只写 `x-pathname` 头，不做鉴权——边缘中间件在代理+子路径后读不到安全 cookie） | `src/proxy.ts` | 改成 Next 16 的 proxy 约定 |
| `app/auth/login/*` | `src/app/auth/login/` | W3 按钮 + 开发登录表单 |
| `tests/huawei-fetch.test.ts`、`auth-cookies.test.ts`、`auth-callback-path.test.ts` | `tests/` | 原样 |

- SSO userinfo 只给 `uid(工号)/displayNameCn/displayNameEn/email/employeeType/telephoneNumber`，**没有部门/地点** → 部门只来自花名册导入或手工维护；首登把整包 `rawProfile` 存下备查。
- `signIn` 回调 → `src/lib/auth/provision.ts#provisionSsoUser`：按 `huaweiW3Id` 幂等 upsert User（P2002 重读）；`SUPER_ADMIN_W3_IDS` 命中则提升为 SUPER_ADMIN（只升不降）；`employee.updateMany({ employeeKey, userId: null })` 关联花名册（不从 SSO 自动建 Employee，避免路人污染花名册）。
- `jwt`：登录时写 `uid/w3Id/name/role/isActive/roleAt`，90s TTL 从 DB 刷新 role；办公室授权**不进 JWT**，改动请求时查一次 `OfficePermission` 主键（撤销即时生效）。
- 开发登录：Credentials provider `id:'dev'`（工号+姓名），仅 `ENABLE_DEV_LOGIN && !ENABLE_SSO && NODE_ENV!=='production'` 时注册，env 校验拒绝生产开启。本地开发无需 UniPortal。
- 登录门禁：`src/app/(app)/layout.tsx` 里 `await requireUser()`（读 `x-pathname` 构造 callbackUrl 后 redirect），`/auth/*` 在分组外。

### 5.2 权限分层

`src/lib/permissions.ts`（纯函数，客户端可用）：`ROLE_RANK = { USER:0, EDITOR:1, MANAGER:2, ADMIN:3, SUPER_ADMIN:4 }`，ADMIN 及以上隐含所有办公室 MANAGER。

| 能力 | USER | EDITOR(办公室) | MANAGER(办公室) | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|---|
| 查看/搜索/导出 xlsx、PNG | ✓ | ✓ | ✓ | ✓ | ✓ |
| 分配/释放/移动/交换座位；本办公室内新建/编辑员工 | | ✓ | ✓ | ✓ | ✓ |
| 编辑布局（楼层/区域/座位/底图）、导入、授予 EDITOR | | | ✓ | ✓ | ✓ |
| 新建/编辑/删除办公室、授予 MANAGER、部门颜色、全局审计、员工停用 | | | | ✓ | ✓ |
| 任免 ADMIN（最后一个超管不可降） | | | | | ✓ |

`src/lib/auth/guards.ts`（server-only，仿 `skills-community/lib/admin.ts` 的 `getManageActor/requireUser/gateApi`）：`getActor()`(react cache)、`requireUser()`、`requireRole('ADMIN'|'SUPER_ADMIN')`、`requireOfficeAccess(officeId,'EDITOR'|'MANAGER')`、`loadOfficeCapabilities()` → `{canAssign,canEditLayout,canGrant}`、`gateApi({role?,office?,need?})`、`apiError(e)`（ApiError→JSON；ZodError→400；P2002/P2034→409）。错误体：`401 {error:'unauthenticated'}`、`403 {error:'forbidden',need,officeId}`、`409 {error:'version_conflict'|'seat_occupied'|'seat_code_taken'|'preview_stale'}`。每个 office/floor GET 都附带 `viewer` 能力，页面不用二次请求。

## 6. 地图：数据形状、2D、编辑器、分配、3D

### 6.1 元素类型（`src/lib/map/types.ts` + `schema.ts` zod，前后端共用）

世界坐标 = 整数**厘米**，y 向下；默认网格 20cm（每层可设 10/20/50）；默认工位 120×60。`Seat`、`Zone` 落表；`Wall(polyline,thickness)`、`Door`、`Label`、`Furniture(meeting|pantry|printer|elevator|stairs|restroom|storage|reception|custom)` 存 `Floor.decor.elements`，`schemaVersion` + `migrateDecor()`。客户端统一为 `elements: Record<Id, MapElement>`（选择/变换/撤销/框选逻辑统一），`diff.ts` 拆回 seats/zones/decor 持久化。id 用 `crypto.randomUUID()` 客户端生成，省掉临时 id 映射。

### 6.2 2D 查看器（`src/components/map2d/`，React + SVG）

选 SVG 不选 react-konva/xyflow/tldraw：≤200 座位 + 百来个装饰对 DOM 毫无压力；CSS 变量直接给暗色模式；原生 pointer 事件做命中；文字任意缩放清晰；DOM 本身就是导出格式。

- `useViewport()`：滚轮/触控板以光标为中心缩放、背景拖拽平移、双指捏合；transform 放 ref、rAF 刷到 `<g transform>`。
- 命中：根 `<svg>` 一个委托处理器 `e.target.closest('[data-id]')`。
- 悬停：portal 的 `<SeatTooltip>`（姓名/工号/部门/座位号）；点击 → `<DetailsPanel>` 侧滑。
- 区域淡色：`.zone-tint { fill-opacity:.08; mix-blend-mode:multiply }`，暗色 `.14 + screen`，12 色低饱和调色板（`colors.ts`），底图在下面仍可读。
- 图例 `<DepartmentLegend>`：点部门高亮，其他座位淡到 .3。
- 搜索定位：`flyTo(seatId)` framer-motion `animate()` 550ms 平移缩放 + 座位脉冲两下；深链 `?seat=CODE` 首次加载后同样处理。
- LOD：k<.6 只画色块；.6–1.2 姓名；≥1.2 姓名+工号。
- 移动端：查看/搜索可用，侧栏变 sheet；编辑仅桌面。
- 导出（`lib/map/export.ts`，零依赖）：克隆 svg → 内联计算样式与底图 dataURL → `XMLSerializer` 出 .svg；PNG 走 `<img>` → 2× canvas → `toBlob`。

### 6.3 2D 编辑器（`src/components/editor/`，`src/stores/editor-store.ts`）

- 工具：`select | seat | zone | wall | door | label | furniture | image`（快捷键 V S Z W D T F B）。`useCanvasInteraction()` 状态机：`idle → panning | marquee | dragging | resizing | rotating | drawingWall | drawingPolygon | placing`，pointer capture。
- 吸附：对**拖拽增量**吸附（`round(v/grid)*grid`），Alt 临时关闭；角度 15°，Shift 自由；框选 = 包围盒相交；多选整体拖动；区域/家具 8 个缩放把手 + 1 个旋转把手；墙体逐点点击，Enter/双击结束，Esc 取消。
- Store：`zustand` + `zundo temporal`（`partialize` 只跟踪 `elements/meta`，limit 100；拖拽期间 `pause()/resume()` 让一次手势 = 一步撤销）；`lastSaved` 快照做 diff 基准。
- **阵列生成** `<SeatArrayDialog>`：行×列、尺寸、间距、旋转、编号前缀/起始/补零、编号顺序（行优先/列优先/蛇形），画布实时幽灵预览，编号与现有冲突则拒绝。
- 属性面板按选中类型切换（座位：编号/状态/区域；区域：名称/部门/颜色；家具：类型/名称；文字：内容/字号）。底图面板：上传、透明度/缩放、解锁拖动、两点标定（点两点输入实际距离 → 换算比例）。
- 快捷键：方向键微移一格（Shift ×5）、Del、⌘Z/⇧⌘Z、⌘D、⌘A、Esc、G 网格、空格拖平移、⌘S 立即保存。

### 6.4 座位分配模式（`src/components/assign/`，EDITOR 即可用）

`<AssignPanel>` 列出本办公室未落座员工（按姓名/工号搜索，可快速新建员工）；一个 `@dnd-kit` `DndContext`：员工行与已占座位都是 `useDraggable`，画布是唯一 `useDroppable`，目标座位用 `elementFromPoint(...).closest('[data-seat-id]')` 解析。拖到空位 → 分配/移动；拖到有人的座位 → 交换（toast 可撤销）。详情面板提供 分配 / 移动到… / 交换 / 释放。座位视觉：空闲 = 表面色 + 描边；已用 = 姓名+工号+3px 部门色条；预留 = 斜纹 + 「预留」；停用 = 60% 透明 + 划线。

### 6.5 持久化

- `GET /api/floors/[id]` → `{ floor(version, decor), seats(含员工摘要), zones, unassignedEmployees, departments, viewer }`；`useFloorData()`（SWR：焦点重验，查看/分配模式 30s 轮询，编辑模式关闭）。
- `PUT /api/floors/[id]/layout` `{ baseVersion, ops[] }`，ops 为 zod 判别联合：`seat.upsert | seat.delete(有人则拒) | zone.upsert | zone.delete | decor.set | floor.patch`。一个事务：`floor.updateMany({ where:{id, version:baseVersion}, data:{version:{increment:1}} })` 影响 0 行 → `409 version_conflict {currentVersion}`；`seat_code_taken` 由唯一约束兜底。`useAutosave`：1.5s 防抖 + `visibilitychange` + ⌘S + `beforeunload` 拦截；409 时 toast「他人已修改」→ 重新加载（默认）/ 强制覆盖（确认后把本地 diff 重放到新版本）。编辑模式每 30s `GET /version` 提前预警。
- 分配走 `POST /api/seats/[id]/assign|release|swap`（行级校验 + 唯一约束，不动 `Floor.version`，分配者与布局编辑者互不阻塞），SWR 乐观更新失败回滚。

### 6.6 3D 视图（`src/components/map3d/`，`src/lib/map3d/`）

`FloorMap3D = dynamic(() => import('./Scene'), { ssr:false })`。`convert.ts`：cm→m，`(x,y)→(x,0,y)`。`<Canvas orthographic frameloop="demand">` + drei `<CameraControls>` 限制俯仰角（默认等轴测感），`setLookAt(...,true)` 即飞行定位，不手写补间。网格：地板 + drei `<Grid>`；区域 = `ShapeGeometry` 淡色贴地；墙 = 每段 1.2m 高盒子（半高保持「稍微立体」、不遮座位）；房间 = 2.4m 半透明盒 + `<Edges>`；工位桌/显示器/椅子用 drei `<Instances>`（3 个 draw call，保留逐实例颜色与事件）。**标签**：`labelTexture.ts` 把姓名+工号画到 2D canvas → `CanvasTexture` 贴在显示器上方小平面，中文走系统字体、零字体文件（避开 drei `<Text>` 联网拉 Roboto 的坑）。悬停/点击/高亮/脉冲与 2D 共用 `view-store`；材质按 `useTheme()` 切换明暗。两种渲染器都从 `useFloorScene()` 取同一份 `FloorScene`（编辑模式来自 editor store，其余来自 SWR）。

## 7. 导入 / 导出（`src/lib/import/`、`src/lib/export/`）

- `parse.ts`：拷贝 `skills-community/lib/employee-import.ts` 的 `parsePastedText/parseCsvText/parseCsv/parseXlsx/parseUpload`（jszip 解析、`utf-8-sig`→gbk 回退、列序无关），行加 `rowNo`。`COLUMN_ALIASES` 扩展：座位编号 `座位编号/座位号/座位/工位/工位号/seat`、工号 `工号/员工号/员工编号/account/uid`、姓名、部门 `部门/dept`、团队 `团队/小组/team`、职位、邮箱、电话、备注 `备注/note/remark`、楼层 `楼层/floor`、状态 `状态/status`（`离职/inactive` ⇒ 离职处理）。
- `normalize.ts`：拷贝 `employee-directory.ts` 的 `canonicalAccountText/accountMatchKey/sameAccount`（NFKC、`z` 前缀、数字段匹配）；`normalizeSeatCode` = NFKC + 去空白 + 大写。
- `diff.ts`：纯函数 `computeImportDiff({ rows, mode:'merge'|'replace', snapshot, actorIsAdmin }) → ImportDiff` + `diffHash`。错误（整体阻断，全有或全无）：`unknown_seat / ambiguous_seat / seat_disabled / floor_mismatch / duplicate_employee / duplicate_seat / missing_name(新员工) / missing_employee_no / cross_office_move_forbidden(非 ADMIN)`。警告：`name_changed / new_department / reactivated / displaced(被挤出且不在表内) / cross_office_move`。逐行分类：员工 `create|update(fields)|unchanged`，座位 `assign|move|reassign|move+reassign|unassign|unchanged`。`replace` 模式 = 表即本办公室全量真相：不在表内的占用者、有工号无座位的行 → 释放；有座位无工号 → 清空该座位。
- `apply.ts#runImport`：Serializable 事务 → 重取快照重算 diff → hash 不等 ⇒ `409 preview_stale` → upsert 部门 → upsert 员工（含 `leftAt`/复职）→ 先统一释放再分配（满足唯一约束）→ 关联登录账号 → AuditLog（一条 `import.apply` 汇总 + 每个座位/员工变更一条，同 `batchId`）→ 汇总。预览与应用之间的状态：**客户端回传规范化 rows + diffHash**，服务端事务内重算（无临时文件、无缓存、重启/多进程安全、并发改动被 hash 拦住）。
- `template.ts#buildImportTemplate(office)`（exceljs）：表 1 表头 `座位编号|工号|姓名|部门|备注|楼层|团队|职位|状态` + 示例行；表 2 `座位清单`（编号/楼层/当前占用者）并给座位编号列做数据有效性下拉。
- `export/seats-xlsx.ts#buildSeatTableXlsx`：列 `研究所|城市|办公室|楼层|区域|座位编号|状态|工号|姓名|部门|团队|职位|邮箱|电话|备注|更新时间`，按楼层 + 自然编号排序；表头与导入别名一致，导出→改→导入可闭环。

## 8. API 一览（`src/app/api/**/route.ts`）

| 方法 路径 | 门禁 | 用途 |
|---|---|---|
| GET /me | user | 角色 + 办公室授权 |
| GET /offices；POST /offices；PATCH,DELETE /offices/[id] | user / ADMIN | 树形（研究所→城市→办公室，含楼层/座位统计）；有落座员工时拒绝删除 |
| GET /offices/[id]；GET /offices/[id]/seats | user | 办公室 + 楼层 + `viewer`；平铺座位表 |
| GET,PUT /offices/[id]/permissions；DELETE …/[userId] | MANAGER 授 EDITOR / ADMIN 授 MANAGER | `{ w3Id, role }`，审计 |
| POST /offices/[id]/floors；PATCH,DELETE /floors/[id] | MANAGER / ADMIN | 楼层 CRUD |
| GET /floors/[id]；GET /floors/[id]/version | user | 完整楼层数据 / 仅版本号 |
| PUT /floors/[id]/layout | MANAGER | `{ baseVersion, ops[] }` → 全量楼层 + 新 version |
| POST /floors/[id]/background；GET /files/[...key] | MANAGER / user | 底图上传（≤10MB，仿 multillm-chat `src/app/api/upload/route.ts` + `src/lib/attachments.ts` 写 `UPLOAD_DIR`）/ 受控读取 |
| POST /seats/[id]/assign \| release \| swap | EDITOR(seat.officeId) | `{ employeeId, allowMove, allowReplace }`；跨办公室移动需 ADMIN |
| GET /employees?q&department&officeId&unassigned&active&page；POST；PATCH /employees/[id]；POST …/deactivate \| reactivate | user / EDITOR+ / ADMIN 或所在办公室 MANAGER | 花名册；停用 = `isActive=false, leftAt`，座位自动释放 |
| GET,POST,PATCH,DELETE /departments | user / ADMIN | 部门颜色 |
| GET /imports/template?officeId；POST /imports/parse；POST /imports/apply | MANAGER(officeId) | 模板 / 预览 / 应用 |
| GET /exports/seats.xlsx?officeId&floorId | user | 座位表 |
| GET /search?q | user | 人（含 办公室/楼层/座位/坐标）+ 座位编号 + 办公室 |
| GET /audit?officeId&action&actorW3Id&from&to&page | ADMIN 全局 / MANAGER 本办公室 | 分页审计 |
| GET /admin/users；PUT /admin/users/[id]/role | ADMIN 读 / SUPER_ADMIN 写 | 任免 ADMIN |

## 9. 页面与组件

```
src/app/layout.tsx                        lang=zh-CN, geist 字体, ThemeProvider(拷 multillm-chat), sonner Toaster
src/app/(app)/layout.tsx                  requireUser → AppShell: 顶栏(全局搜索/2D-3D/主题/用户菜单) + 侧栏办公室树
src/app/(app)/page.tsx                    总览：研究所→城市→办公室卡片（总座位/已用/空闲）
src/app/(app)/offices/[officeId]/page.tsx 跳到第一层
src/app/(app)/offices/[officeId]/floors/[floorId]/page.tsx   ?view=2d|3d  &mode=view|assign|edit  &seat=CODE
src/app/(app)/employees/page.tsx          花名册表格 + 导入向导（上传→预览 diff→确认）+ 导出
src/app/(app)/admin/{offices,departments,users,audit}/page.tsx
src/app/auth/{login,error}/page.tsx
src/components/floor/    FloorWorkspace, FloorHeader(面包屑/视图与模式切换/SaveStatus/导出菜单), StatsStrip(总/已用/空闲/预留/停用 + 部门 chips 兼图例), DetailsPanel, SeatTooltip
src/components/map2d/    FloorMap2D + 图层(Background/Grid/Zone/Wall/Furniture/Seat/Label/Overlay) + 图元
src/components/editor/   ToolPalette, PropertiesPanel, SeatArrayDialog, BackgroundPanel, EditorHotkeys
src/components/assign/   AssignPanel, EmployeeChip, AssignDndProvider
src/components/map3d/    FloorMap3D(dynamic), Scene, FloorSlab, ZonePatches, Walls, Desks, Rooms, Labels3D, CameraRig
src/components/ui/       拷 multillm-chat 的 13 个 + 新增 slider/select/toggle-group/sheet/table/kbd
src/lib/{env,db,cn,base-path,patch-fetch,permissions,labels(状态/角色/错误码中文文案),audit,search}.ts
src/lib/map/{types,schema,geometry,seatArray,diff,export,colors}.ts   src/lib/map3d/{convert,labelTexture,palette}.ts
src/lib/floors/{layout,ops-schema}.ts   src/lib/seats/assign.ts   src/lib/employees/{queries,schema}.ts   src/lib/files/{storage,serve}.ts
src/stores/{editor-store,view-store}.ts   src/hooks/{useFloorData,useFloorScene,useViewport,useCanvasInteraction,useEditorHotkeys,useAutosave,useFloorUrlState}.ts
prisma/schema.prisma  prisma.config.ts(拷 multillm-chat)  scripts/{seed,preflight}.ts  deploy/{employee-seats.nginx.conf,employee-seats.service}  docs/deploy.md  tests/
```

**设计方向**：浅色优先、克制、像一张精致的印刷平面图而不是仪表盘——`#fafafa` 画布、白色楼板、点状网格、深灰墙线、区域 8–14% 低饱和 oklch 淡色；座位卡 1px 描边、圆角 6、姓名 12 号半粗（中文 ≤4 字全显，更长 3 字+…）、工号 10 号等宽弱化、部门色条；面板 200ms ease-out 滑入，悬停轻抬升；在 multillm-chat 的 token 基础上加 `--map-canvas/--map-floor/--map-grid/--map-wall/--seat-*` 明暗两套。实现 UI 阶段加载 `emil-design-eng` 与 `design-taste-frontend` skill 做打磨。

## 10. 环境、脚本、部署

- `src/lib/env.ts`（zod，拷 skills-community 的 `bool/num/optStr`）：`DATABASE_URL, AUTH_SECRET, AUTH_URL, ENABLE_SSO, SSO_CLIENT_ID/SECRET, SSO_AUTHORIZE_URL, SSO_ACCESS_TOKEN_URL, SSO_USERINFO_URL, SSO_SCOPE=base.profile, SSO_VERIFY_SSL, USE_PROXY, HUAWEI_PROXY_HOST/PORT, SUPER_ADMIN_W3_IDS, ENABLE_DEV_LOGIN, UPLOAD_DIR=./storage, MAX_UPLOAD_MB, MAX_IMPORT_ROWS=5000`；校验：开 SSO 则 SSO_* 必填、生产禁 dev 登录、至少一种登录方式。`NEXT_BASE_PATH` 仅构建期（`next.config.ts` 读入并透出 `NEXT_PUBLIC_BASE_PATH`，同 skills-community `next.config.mjs`）。
- `package.json` scripts：`dev, build(prisma generate && next build), start, typecheck, lint, db:generate, db:migrate, db:deploy, db:seed, preflight, test`。
- `scripts/seed.ts`：2 个办公室 × 2 层，6×8 座位阵列、3 个区域、6 个部门、~60 员工、~50 落座、1 个开发超管（生产无 `--force` 拒跑）。
- 本地开发：本机 Postgres（brew/docker），`ENABLE_SSO=false ENABLE_DEV_LOGIN=true`。
- **部署（子路径）**：`deploy/employee-seats.nginx.conf` 改自 `skills-community/deploy/ai-community.nginx.conf` —— `upstream 127.0.0.1:3200`、`location ^~ /seats/_next/static/ { alias … }`、`location ^~ /seats/ { proxy_pass http://employee_seats; }`（**无尾斜杠**，`X-Forwarded-Proto https`）、`location = /seats { proxy_pass … }`（代理而非 301，避免与 Next 的 308 互踢）；放在 catch-all `location /` 之上；reload 用 `kill -HUP <master>` 不要 `systemctl restart nginx`。`deploy/employee-seats.service` 改自 `ai-community.service`：`Environment=NEXT_BASE_PATH=/seats`，`ExecStart=<node> node_modules/next/dist/bin/next start -p 3200 -H 127.0.0.1`。构建：`pnpm install && pnpm db:deploy && NEXT_BASE_PATH=/seats pnpm build && sudo systemctl restart employee-seats`。DB：`CREATE SCHEMA IF NOT EXISTS employee_seats`，`DATABASE_URL=…?schema=employee_seats&connection_limit=10`。SSO：`AUTH_URL=https://cari.rnd.huawei.com/seats/api/auth`（必须以 `/api/auth` 结尾），回调 `…/seats/api/auth/callback/huawei` 已被 cari 的备案覆盖，复用 ai-community 的 `SSO_CLIENT_ID/SECRET`。
- `scripts/preflight.ts`（TS 版 `news/scripts/envcheck.py`，✓/✗/! 行，不打印取值）：Node ≥ 20 且 `TextDecoder('gbk')` 可用、env 通过、`new URL(AUTH_URL).pathname === NEXT_BASE_PATH + '/api/auth'`、DB 连通 + schema 存在 + 待迁移数、`UPLOAD_DIR` 可写、SSO 主机 443 可达、`.next/required-server-files.json` 的 basePath 与环境一致、3200 端口状态。

## 11. 超出原始需求、建议纳入 v1 的功能

全局搜索 + 飞行定位与脉冲高亮；部门图例/筛选高亮；座位状态（空闲/已用/预留/停用）与占用率统计；变更审计日志（谁/何时/改了什么，导入按批次）；导出 xlsx 座位表 + 平面图 PNG/SVG 打印；「未落座员工」列表拖拽落座、移动/交换/释放；阵列批量生成工位 + 自动编号；底图上传与两点标定；多人编辑版本冲突保护；深链接分享 `?seat=A12`；暗色模式；移动端查看；离职处理（停用即释放座位、表格「状态=离职」批量处理）；会议室/茶水间/打印机等公共区域标注。

**后续迭代（不在 v1）**：员工自助认领/纠正座位（提交→管理员确认）；座位二维码贴纸；一人多座/热桌（去掉 `employeeId @unique` 改关联表）；对接 HR/组织 API 自动同步部门；SSE 实时同步；Playwright E2E；中英双语。

## 12. 实施里程碑

| 里程碑 | 内容 | 验证 |
|---|---|---|
| **M0 脚手架 + 登录 + 权限骨架** | pnpm 初始化、Tailwind v4 主题 token、ui/* 拷贝、Prisma schema + 首个 migration、`env.ts`、SSO 文件拷贝与适配、dev 登录、`guards.ts`、`(app)/layout` 门禁、AppShell、`/api/me`、seed | `pnpm typecheck && pnpm test`（SSO 三个测试通过）；本地 dev 登录进入外壳；未登录访问被重定向到 `/auth/login?callbackUrl=` |
| **M1 基础数据** | 办公室/楼层/部门/员工 CRUD 页面与 API、办公室树侧栏、总览卡片、员工表格与搜索 | 新建研究所/城市/办公室/楼层；USER 调用 POST /offices 得 403 |
| **M2 2D 查看器** | `types/schema`、FloorMap2D 各图层、视口、悬停/详情、图例、StatsStrip、全局搜索 + flyTo、深链、LOD、PNG/SVG 导出 | seed 数据下搜工号 → 定位到座位并高亮；`?seat=` 直达；暗色可读 |
| **M3 座位分配** | AssignPanel + dnd-kit、assign/release/swap API、乐观更新、审计写入、离职停用释放 | 拖人到空位/有人位（交换）；两个浏览器 tab 互相看到 30s 内刷新；审计页有记录 |
| **M4 2D 编辑器** | 工具状态机、吸附、框选/多拖/旋转/缩放、墙体/多边形、属性面板、阵列生成、撤销重做、自动保存、layout ops 事务 + 版本冲突、底图上传与标定 | 从空白画出一层（底图 + 6×8 阵列 + 2 个区域 + 墙门）；两 tab 同时编辑第二个保存得 409 并按提示恢复；刷新后布局一致 |
| **M5 导入/导出** | parse/normalize/diff/apply/template、导入向导（上传→预览→确认）、xlsx 导出 | 下载模板填 20 行导入（含新员工/换座/挤位/离职/错误行）预览与结果一致；导出→改→导入闭环；vitest diff 决策表全绿 |
| **M6 3D 视图** | R3F 场景、实例化工位、canvas 标签、相机控制与飞行、明暗材质、懒加载 | 2D/3D 切换同一层数据一致；点击/悬停/搜索定位在 3D 生效；首屏不加载 three 分包 |
| **M7 权限管理 + 审计 + 打磨** | 授权页（按工号搜用户授 EDITOR/MANAGER）、任免 ADMIN、审计页筛选、加载/空态/错误态、响应式、设计 skill 打磨 | 授权后 90s 内 JWT 角色刷新、办公室授权即时；手机查看可用 |
| **M8 部署** | nginx/systemd/preflight/docs、`NEXT_BASE_PATH=/seats` 构建、迁移、SSO 全流程 | `pnpm preflight` 全绿；`curl -sI https://cari.rnd.huawei.com/seats/auth/login` 200；W3 登录回调落回 `/seats/`，登出不跳 localhost；静态资源在 `/seats/_next/static/` |

## 13. 验证方式

- 单元测试（vitest，`tests/**/*.test.ts`）：导入解析（jszip 造 xlsx、gbk CSV、BOM、列序无关）、工号/座位编号归一化、`computeImportDiff` 决策表（merge/replace、挤位、跨办公室、复职、hash 稳定）、`permissions` 等级格 + `gateApi` 401/403 体、layout ops schema 与占用座位删除拒绝，以及拷来的 SSO 三件测试。
- 本地端到端：dev 登录 + seed 数据，用浏览器（可用 Claude in Chrome）走完 M2–M6 的验证项；多 tab 冲突与并发分配场景手工验证。
- 生产：`pnpm preflight` → nginx `-t` + `-HUP` → SSO 往返 → 导入一份真实座位表试跑 `merge` 模式并核对审计。

## 14. 风险与注意

- React 必须锁 19.2.x（R3F peer 上限）；Prisma 锁 7.10.0；安装后跑一次 `pnpm build` 确认 next-auth beta.32 与 Next 16 route handler 的 basePath 剥离行为不变（`handlers.ts` 依赖它）。
- 内网无外网：字体、three 全部打包；构建在服务器上进行时不能有任何构建期网络请求。
- SSO 无部门字段：部门以导入为准，UI 不要暗示「SSO 自动同步部门」。
- 子路径部署四件套（`AUTH_URL` 以 `/api/auth` 结尾、`AuthProvider basePath`、`handlers.ts` 补 basePath、客户端 `installApiBasePathFetch`）缺一不可，M0 就按子路径写好，本地用空 basePath 跑。
- 不把任何密钥提交进仓库（`.env` 在 gitignore，`.env.example` 只放占位）。
