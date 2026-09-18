# 座位图 v2：Two Point 风格编辑器、蓝图渲染、3D 品质、AI 户型图与 AI 物件

## 1. Context

v1（已上线 GitHub `ejbo/employee-seats`，原计划见仓库 `docs/plan.md`）实现了 2D/3D 座位图、编辑器、导入、权限。用户试用后希望编辑体验向 *Two Point Hospital / Two Point Campus* 靠拢：拖拽拉伸就能建房间、整层像一张统一的图纸、物件更精致、批量与对齐更省心；上传户型图时不只当底图，而是把房间/墙/门**重建成可编辑布局**；参考 `rollingfruit/office-workstation-threejs`（让能看图的大模型把工位照片写成参数化 Three.js 场景），希望管理员能「上传桌子照片 → 变成可用物件」。

已确认的决策：
- AI 模型两种都支持：开发机 Claude API；内网用 ai4news 模型网关 `https://ai4news.rnd.huawei.com/model/v1`（OpenAI 兼容，视觉模型 `zai-org/GLM-4.6V`，直连不走代理）。未配置时功能退化为手动方案。
- 顺序 **A → B → C → D**：A 房间/墙/蓝图 + 智能对齐 + 批量 + 物件库；B 3D 品质；C AI 户型图；D 照片生成物件。
- 3D 模型：**工位（桌/椅/显示器）程序化**（需按部门/状态/主题变色，且与 AI 物件共用同一渲染器）+ **道具用 Kenney CC0 glTF**（沙发、柜子、绿植、会议桌…随仓库分发，meshopt 压缩，绝不用 Draco——其解码器会去拉 CDN）。
- 户型图识别提取：房间、墙、门 + 功能标注；识别结果先叠在图上校对与标定比例，确认后才生成。

约束不变：中文 UI、内网无外网（所有资源随仓库）、SVG 2D、React Compiler lint 规则（effect 里不同步 setState、渲染期不读 ref）。

## 2. 全局数据与架构变化

| 变化 | 说明 |
|---|---|
| `Floor.decor` → `schemaVersion: 2` | 新增 `RoomEl`；`DoorEl` 改为锚定在房间边/墙段上；`FurnitureEl` 改为 `typeKey`（物件库）+ 可选 `typeId`（自定义物件）。`parseDecor` 读到 v1 时用纯函数 `migrateDecorV1` 迁移（房间类家具 → RoomEl；旧门吸附到最近边，否则合成一段墙；printer/custom → typeKey），坏数据仍回退空布局。**不能让旧楼层变空** |
| `Seat.style` 列 | `desk-basic \| desk-l \| desk-l-left \| bench`，默认 desk-basic（一次 additive migration） |
| `ObjectType` 表（D 阶段） | 自定义物件：`id, key, name, category, w, d, h, spec Json(DSL), thumbnailKey?, createdById, isActive` |
| `AppSetting` 表（C 阶段，可选） | 超管在页面里配置 LLM provider/baseUrl/apiKey/model（覆盖 env，免重启），仿 skills-community 的 `LibrarySetting` |
| `src/lib/llm/` | 从 skills-community `lib/llm/` 移植（config/anthropic/openai/egress/sse/limits + `extractJsonObject`），把 `LLMMessage.content` 扩成 parts（text + image：Anthropic base64 block / OpenAI `image_url` data URL） |
| 墙不再存储 | 墙由房间边界派生（`deriveWalls`），`WallEl` 只保留独立/斜墙 |

## 3. Phase A — 房间、蓝图、智能对齐、批量、物件库

### A1 类型 / schema / 迁移（`src/lib/map/types.ts`、`schema.ts`、新 `migrate.ts`、`rectilinear.ts`）
- `RoomEl { kind:"room", id, name, type: office|meeting|pantry|restroom|elevator|stairs|storage|reception|corridor|other, points:[x,y][]（顺时针、≥4、**每条边水平或垂直**、不旋转）, floorStyle?: plain|tile|wood|carpet, wallHeight? }`；`corridor` 不生成墙。
- `DoorEl { anchor: {kind:"room", roomId, edgeIndex} | {kind:"wall", wallId, segIndex}, offset(cm 自边起点), w, swing:"in"|"out", hinge:"start"|"end" }`。
- `rectilinear.ts`：`polygonArea/centroid/pointInPolygon/largestInscribedRect/moveRoomEdge(points,i,delta)/moveRoomVertex/roomsOverlap/unionRectilinear`（坐标网格切格法：合并 x/y 坐标集 → 标记内部格 → 抵消相对方向的格边 → 串成边界 → 合并共线；结果必须是无洞单多边形）。
- zod：`roomSchema` refine 直角多边形且不自交；`floorDecorSchemaV1` 保留，`floorDecorSchema` = v2 并校验门锚点存在。

### A2 墙派生与蓝图渲染（新 `src/lib/map/walls.ts`、`src/components/map2d/blueprint-layers.tsx`）
- `deriveWalls(rooms, walls, doors) → { pieces: 轴对齐矩形[], diagonals, doors: DoorGeom[], pathD }`：房间边（厚 12cm）+ WallEl 段 → 按方向与所在直线分组 → 合并重叠/相接区间（相邻房间共享一面墙）→ 按门减去开口 → 原始端头方头（+t/2，天然成直角接头）、开口端头平头 → 全部墙一条 `<path>`。按「显示中的元素（含拖拽 overrides）」memo，拉伸房间时墙实时跟随。
- 2D 图层（查看器与编辑器共用）：纸面 + 1m 细线 + 网格点 → 底图 → 房间地面（按类型淡色 + pattern：卫生间/储物斜纹、楼梯条纹、电梯 X）→ 部门区域（multiply）→ 墙 path → 斜墙 → 门（门套 + 门扇 + 四分之一圆弧）→ 物件符号 → 座位 → 房间标签（名称 + `6.4×4.2 m · 26.9 m²`）→ 文字 → 编辑 overlay。描边宽度屏幕恒定（`1.25/k`），墙用真实厚度。
- 新 token：`--bp-paper/--bp-line/--bp-wall/--bp-room-{type}/--guide`（明暗两套）。`DimensionOverlay`（选中元素每条边外侧标尺寸）与 `Rulers`（画布上/左两条独立 `<svg data-ui>`，按缩放选 1m/0.5m/0.1m 刻度 + 光标线；独立 svg 不影响导出）。
- 3D：房间 = ShapeGeometry 地面 + `deriveWalls` 的墙块（B 阶段再做质感）。

### A3 房间与门的编辑体验（`editor-canvas.tsx`、`properties-panel.tsx`）
- 房间工具 **R**（旋转 90° 改为 ⇧R）：拖出矩形，边上实时标 `6.40 m`；角点走吸附引擎（网格 + 其他房间边 + 楼层边界）；松手（≥1×1 m）创建 `房间 N`（类型沿用上次），切回选择工具并自动聚焦名称输入。
- 重叠规则：**内部不相交，共享边鼓励**（这就是共享墙）；拖拽/拉伸时重叠预览变红并拒绝提交（toast）；迁移来的重叠只提示不阻断。
- 选中房间：**边把手**（ns/ew 光标）与角把手；拖边 = 垂直平移该边（最小 50cm，被相邻平行边夹住）；拖角 = 同时动两条边，天然保持直角。拖房间整体时带走内部座位/物件（⌥ 只拖房间）；门相对边定位自动跟随。
- 「+ 形状」（`room-add` 工具）：在房间上再拖一个矩形，实时预览并集（L 形），非单多边形则拒绝。
- 门工具 **D**：悬停时找最近的房间边/轴对齐墙段（12px/k），预览吸附到边上、offset 按网格、夹在边内；选中门可沿边滑动，**X** 切开向、**⇧X** 换铰链侧。
- 快捷动作：「把房间设为部门区域」（用房间多边形建 Zone）。

### A4 智能吸附与参考线（新 `src/lib/map/snap.ts`，纯函数 + 测试）
- 手势开始时收集候选：其他元素的左/中/右、上/中/下；房间边及**内外墙面 + 5cm 净距**（由顺时针方向知道哪侧是室内，桌子贴墙即齐）；楼层边界；等间距候选（同轴相邻元素 `right + gap`）。
- 每轴在阈值 `8px/k` 内按 `|d| − 权重`（房间/墙/楼层 > 等距 > 物件边 > 中心）取最优 → `dx/dy`；没有命中时退回网格吸附。⌥ 关闭吸附，⇧ 锁主轴。旋转：接近 90° 倍数 4° 内吸到 90°，否则 15°，⇧ 自由。
- 输出品红参考线（跨两元素范围）+ 距离/等距徽标；接入移动、缩放（只吸被拖的边）、房间绘制/加形/拉边、物件库拖放与盖章。

### A5 物件库（新 `src/lib/map/catalog.ts`、`src/components/editor/library-panel.tsx`）
- `ObjectDef { key, name, category: desk|seating|table|storage|office|kitchen|decor|partition, w, d, h, glyph: GlyphKind, resizable?, model: {kind:"procedural", spec} | {kind:"glb", url, scale} }`；内置约 22 件（直桌、L 桌、椅、显示器、6/8 人会议桌、4 人圆桌、双/三人沙发、单人椅、茶几、文件柜、储物柜、书架、白板、电视、绿植、打印机、饮水机、冰箱、隔断（可拉伸）、电话亭、前台）。
- `ObjectGlyph`：俯视蓝图符号（桌 = 轮廓 + 显示器条 + 椅半圆；圆桌 = 圆 + 椅点；沙发 = 坐垫分割 + 靠背带；柜 = 门缝；书架 = 层线；绿植 = 圆 + 叶脉）。`SeatGlyph` 增加 `style` 分支（L 桌、长条工位）。
- 面板（**F** 打开）：搜索、分类 chips、卡片内嵌 mini svg 符号；按下拖到画布（复用 `beginDragCandidate`，`DragPayload` 扩成联合类型，分配模式的 `useDragSession` 忽略非员工载荷），或点击进入「盖章」模式（⇧ 连续放置）。`FurnitureEl.typeKey` 取代自由类型；旧 `furnitureType` 属性链路删除。

### A6 批量操作（新 `transform.ts`、`batch.ts`、`renumber.ts`、`room-fill.ts`、`seat-array.ts`、`src/stores/clipboard-store.ts`）
- 把画布私有的 `translateEl/rectOf/withRect/rotationOf/withRotation/pointsOf/withPoints/centerOf` 抽到 `transform.ts`（支持房间），其余全是纯函数：对齐 ×6、分布 ×2、整组旋转 ±90（绕选区中心）、翻转（镜像 + `desk-l ↔ desk-l-left`）、复制、`elementsInRoom`。
- `renumberSeats(seats,{prefix,start,pad,order: rows|cols|snake|selection,rowLetters})`：按 y 聚成行（容差 h/2）再按 x 排序，返回 `{codes, conflicts}`；阵列生成改为共用这套编号。
- `fillRoom(room, {deskW, deskD, gapX, gapY, aisle, margin, orientation, pairFacing, numbering}, existing)`：在 `largestInscribedRect` 内排行，`pairFacing` 背对背成对（0/180°），跳过与现有元素相交的格；对话框里 50% 透明预览，确认才 `addMany`。
- 剪贴板 store 跨楼层存活：⌘C / ⌘V（粘到最近光标位置或 +2 格），新 id、重编座位号、清空 `employeeId`、区域仅在目标楼层存在时保留、门只在其房间一起复制时保留。
- UI：选区上方浮动工具条（对齐/分布/旋转/翻转/复制/删除；房间多「填充工位」「选中房间内元素」「+ 形状」）、右键菜单（同上 + 复制粘贴 + 置顶/置底 + 重新编号…）、多选属性面板补共同旋转/尺寸/座位样式/物件类型。

### A7 持久化
- `diff.ts::decorOf` 输出 v2；`EMPTY_DECOR`、Prisma 默认 JSON、`layout-diff.test.ts` 同步；`ops-schema` 的 `decor.set` 只收 v2（客户端加载时已迁移）；`Seat.style` 进 `seatInputSchema/scene.ts/layout.ts/diff.ts`。

### A 交付顺序（每步 typecheck + lint + vitest + 浏览器验证）
1. 类型/schema/迁移/rectilinear（房间先当普通多边形画出来）— 测试 `decor-migrate`、`rectilinear`
2. 墙派生 + 蓝图图层 + token + 标签 + 3D 墙块 — 测试 `walls`（共线合并、共享墙去重、开口减法与端头规则、走廊无墙、斜墙直通）
3. 房间/门工具（绘制、重叠规则、边角把手、整体拖动、加形、门放置/滑动/翻转、属性）— 测试 `room-union`
4. 吸附引擎 + 参考线 + 尺寸标注 + 标尺 — 测试 `snap`
5. 物件库 + 符号 + 座位样式 + 面板拖放/盖章 + 3D 占位盒
6. 批量：transform/batch/renumber/room-fill/seat-array/剪贴板/工具条/右键菜单 — 测试 `transform`、`batch`、`renumber`、`room-fill`
7. 打磨：导出内联 pattern、物件符号 LOD、快捷键速查

## 4. Phase B — 3D 品质（`src/components/map3d/` 拆成 lighting/rooms/walls/workstations/props/camera-rig）

- **渲染基调**：`shadows="soft"`、`dpr [1,1.5]` + `AdaptiveDpr`、`NeutralToneMapping`（ACES 会把 Two Point 那种平涂色调发灰偏紫），暗色曝光 0.85；标签/高亮 `toneMapped={false}` 与 2D 同色。
- **光照**（`lighting.tsx`）：半球光 + 主方向光（阴影相机按楼层拟合，2048，normalBias 0.03）+ `<Environment resolution=64 frames=1>` 内放三个 `<Lightformer>`（纯 GPU 生成，零文件）+ `<ContactShadows frames=1>`（按 `floor.version+theme` 重烘一次，当 AO 用）。「高质量」开关加 `SoftShadows`（PCSS）。本阶段不上后处理（EffectComposer 在核显上得不偿失；若以后要 N8AO：`@react-three/postprocessing@3.1.1` / `postprocessing@6.39.5` / `n8ao@2.0.1`）。暗角用 CSS 径向渐变。
- **材质**（新 `src/lib/map3d/textures.ts`）：canvas 程序化贴图，种子 PRNG，按 `(kind, theme)` 缓存，卸载时 dispose：地毯（底色 + 3% 噪点 + 50cm 拼缝）、木地板（12cm 板条 ±6% 色差 + 纹理 + 缝作 bump）、瓷砖（30cm 网格 + 勾缝）、混凝土；房间类型默认：办公区地毯、会议/前台木地板、茶水/卫生间瓷砖、储物/电梯/楼梯混凝土。部门 zone 淡色仍叠在上面（0.10）。
- **墙**（`walls.tsx`）：`deriveWalls` 的块 → 单位盒 `<Instances>` 按块缩放，高 1.1m（剖切视角不挡座位）、顶盖第二组 Instances（+2cm 宽，2cm 高）、门 = 门框块 + 门扇（0.9×1.1×0.04，铰链开 35°）、会议室可选玻璃段（透明 0.28，`depthWrite=false`）。总共 3–4 个 draw call。
- **工位**（`workstations.tsx` + `procedural-object.tsx` + `src/lib/map3d/objects/*.ts`）：DSL `Part { shape: box|rbox|cylinder|sphere, size:[w,h,d], pos, rot, color: 具体色或 $desk/$frame/$chair/$accent/$screen/$metal/$leaf/$pot, radius, segments }`，`ObjectSpec { id, footprint:[w,d], parts[] }`；`<ProceduralObject spec accent palette/>` 单件渲染，`<ProceduralInstances spec items=[{position, rotation, accent, tint, transparent}]/>` 按 `(shape,size,radius,transparent)` 分组成 drei `<Instances>`，`$token` 在渲染时按 `Palette3D` 解析（主题自动换色）。内置规格：直桌、L 桌、显示器（底座 + 支架 + 屏幕内嵌）、五星轮椅、键盘、绿植（按座位 id 播种 ~25%）、打印机、沙发。状态：已用 = 椅面/靠背/桌前沿部门色 + 屏幕点亮（暗色 emissive）；空闲 = 灰椅、屏幕关；预留 = 桌面 45° 斜纹贴图 + 「预留」牌；停用 = 半透明批次、无显示器；部门筛选时非命中按 70% 混向地板色（不做透明排序）。悬停 = 反向外壳描边 + 3cm 抬升（`maath/easing.damp`，动画期间 `invalidate()`）；选中 = 光环 + 飞行到达时两次脉冲。名牌仍用 canvas 纹理贴桌面，相机转到背面时自动翻 180°。
- **道具**（`props.tsx`）：Kenney Furniture Kit（CC0）选 ~20 件 → `npx @gltf-transform/cli optimize --compress meshopt --texture-compress false` → `public/models/*.glb`（每件 15–60KB）→ `useGLTF(withBasePath(url), false /*no draco*/, true /*meshopt*/)` + `preload`，同型多件用 drei `<Merged>`；找不到对应模型的物件回退到 catalog 的程序化 spec。
- **相机**（`camera-rig.tsx`）：`iso`（正交，`rotateTo(45°,50°)` + `fitToBox` 取代现在的 zoom 估算）/ `free`（透视 45°，俯仰到 85°）两种模式（`?cam=`）；飞行 `smoothTime 0.6` 的 `setLookAt` + `zoomTo/dollyTo`，`onRest` 后脉冲并恢复 0.25；键盘 方向键平移、+/- 缩放、Q/E 转 45°、0 复位、Esc 取消；触屏单指旋转、双指缩放平移。
- **命中**：一个不可见（`MeshDiscardMaterial`）的座位脚印 `InstancedMesh` 接收 `onPointerMove/onClick`（`instanceId → seat`），其他网格 `raycast={noop}`；`onPointerMissed` 清悬停并触发 `onBackgroundClick`（与 2D 取消选中一致）。
- **性能预算**：draw call ≈ 240（名牌各一）→ 以后合图集 ≈ 60；三角 ≈ 1.2M；阴影 2048/1024；`<StatsGl>` 仅 `?perf=1`；卸载时 `clearLabelCache()` + `disposeRoomTextures()`；修掉 `Furniture` 每次渲染 new BoxGeometry。
- **交付顺序**：① 光照/色调/dpr/贴图/暗角 → ② 房间地面 + 实例化墙/盖/门/玻璃 → ③ DSL 渲染器 + 工位实例 + 命中盒（删旧 Desk）→ ④ 悬停抬升/筛选变暗/名牌翻转/飞行缓动/iso-free 切换/键盘触屏 → ⑤ Kenney 道具 + 高质量开关 + dispose 审计。每步在**前台**标签页截明暗两套图，`read_network_requests` 不得出现 gstatic/githack。

## 5. Phase C — AI 识别户型图 → 可编辑布局

### C1 LLM 层（`src/lib/llm/`，移植自 skills-community）
- `types.ts`：`LLMMessage.content: string | Part[]`，`Part = {type:"text"} | {type:"image", mime, base64}`；provider 各自转成 Anthropic `image` block / OpenAI `image_url` data URL。
- `config.ts`：`LLM_PROVIDER=anthropic|openai-compatible`、`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`LLM_USE_PROXY`（内网网关直连 false；api.anthropic.com 走 proxyca 时 true）、`ANTHROPIC_API_KEY`；`isLLMConfigured()`；可选 `AppSetting` 覆盖（超管页「AI 设置」+ 「测试连接」按钮）。`.env.example` 加内网预设：`LLM_PROVIDER=openai-compatible LLM_BASE_URL=https://ai4news.rnd.huawei.com/model/v1 LLM_MODEL=zai-org/GLM-4.6V LLM_API_KEY=<网关 key>`。
- `json.ts`：`extractJsonObject`（剥 `<think>`、找第一个可解析对象、全角标点归一）；不用 `response_format`（自建 vLLM 上不稳）。`limits.ts` 并发槽 + 超时。
- 图片在**浏览器**预处理（canvas：长边 ≤1568px、JPEG q85、base64），不引入 sharp。

### C2 识别与生成（`src/lib/ai/floorplan.ts`、`POST /api/ai/floorplan/recognize`、`src/components/editor/floorplan-import/*`）
- 提示词要求输出（坐标归一化到 0–1000 的图片坐标系）：`{ outline: [[x,y]…], rooms: [{ name, type, polygon（直角多边形）, confidence }], walls: [{a,b}]（外墙/独立墙）, doors: [{x,y, onRoom?: name, width?}], scaleHints: [{ text:"6000", from, to }]（图上标注的尺寸线）, notes }`，zod 校验 + 直角化修正（把近似水平/垂直的边拉直、合并共线）。
- 向导（编辑器「导入户型图」）：① 上传图片 → ② 识别（进度、可重试、可加提示如「这是 3F，上北」）→ ③ **校对层**：图片上叠 SVG，房间多边形可拖顶点/改名/改类型/删除/新增，门可挪，走廊标记 → ④ **标定比例**：在图上拉一条线输入实际米数（或选用识别到的尺寸标注、或输入总宽）→ ⑤ 生成：把像素坐标换成 cm 写入编辑器（房间/墙/门 → decor v2；楼层尺寸按外轮廓重设；图片存为底图并默认 20% 透明可关）；追加或替换现有布局二选一；写审计 `floorplan.import`。
- 手动兜底「磁性描摹」：底图加载时用 canvas 计算 Sobel 边缘图（Web Worker），房间/墙顶点拖动时吸附到 6px 内最强边缘；未配置 AI 时向导直接从 ③ 开始（空识别结果）。
- 工位不从图上识别（用户选择）：生成后用「填充工位」或导入落座。

## 6. Phase D — 照片生成物件

- `POST /api/ai/object/recognize`（MANAGER+）：图片 → 提示词要求输出 `ObjectSpec` DSL（cm、y 向上、原点在脚印中心地面、parts ≤ 40、颜色用具体 hex 或 $token、附 `name/category/footprint/height/confidence/assumptions`）→ zod 校验（尺寸范围、parts 数）→ 返回。
- 对话框：左侧照片，右侧 mini R3F 预览（`<ProceduralObject>` + 轨道相机）与自动生成的 2D 符号（俯视投影：box → 矩形、cylinder/sphere → 圆），可改名称/分类/长宽高（等比缩放 parts）/单个 part 的颜色，可「重新生成」带反馈（「再矮一点」「去掉屏幕」）；无 AI 时提供 parts 表格手工拼。
- 保存到 `ObjectType`；物件库出现「自定义」分类（缩略图 = 预览 canvas 截图存 `thumbnailKey`）；`FurnitureEl.typeId` 引用，`layout.ts` 校验 typeId 存在且 isActive；2D `ObjectGlyph` 与 3D `ProceduralObject` 都由 spec 驱动。管理页 `/admin/objects` 列表/停用/编辑。

## 7. 验证

- vitest：`decor-migrate`、`rectilinear`、`walls`、`room-union`、`snap`、`transform`、`batch`、`renumber`、`room-fill`、`llm-json`（extractJsonObject 边界）、`floorplan-normalize`（直角化/比例换算）、`object-spec`（zod 与投影）。
- 浏览器（Claude in Chrome，**前台标签页**）：A 每步截图 2D；B 明暗两套 3D + 无外网请求；C 用一张示例户型图走完向导（无 AI 时走描摹）；D 用示例照片生成一件并放进楼层。
- 回归：v1 楼层加载不变空（迁移测试 + seed 楼层）；导入/分配/权限流程不受影响；`pnpm build` 通过。

## 8. 风险与备注

- 旧楼层迁移是最大风险：`parseDecor` 必须先尝试 v2、再 v1 迁移、最后才回退空，并在迁移测试中覆盖 seed 的 decor。
- Kenney 模型命名需下载后核对；缺件走程序化回退。gltf 只用 meshopt。
- GLM-4.6V 对复杂户型图坐标可能偏差，校对层与磁性描摹是必需品，不是可选项。
- 3D 验证只能在前台标签页截图（后台标签页 WebGL 不绘制）。
- 每个 Phase 结束都提交一次 git（用户已授权推送到 `ejbo/employee-seats`）。
