# 座位图（employee-seats）

行政 / 管理部门用的办公室座位图：每个办公室是一张可编辑的「地图」，员工可批量导入并按座位编号落座，所有华为账号登录的同事都能查看、搜人；同一份数据提供 2D 平面图与 3D 立体视图。

## 功能

- **查看**：研究所 → 城市 → 办公室 → 楼层；全局搜索姓名 / 工号 / 座位号并飞行定位；按部门淡色区域与图例筛选；悬停 / 点击看详情；`?seat=A12` 深链接；导出 PNG / SVG / Excel。
- **分配**（座位编辑）：把未落座员工拖到座位上，移动 / 交换 / 释放；离职即释放。
- **编辑**（办公室管理员）：Two Point 式的房间编辑——拖出矩形建房间、拉边 / 拖角、「添加形状」并成 L 形，墙由房间边界自动派生（相邻房间共享一面墙），门吸附到房间边或墙段上可滑动 / 换开向；智能吸附（边、中心、墙面净距、等间距，品红参考线 + 尺寸标注 + 标尺）；物件库（工位桌型、会议桌、沙发、柜子、绿植…点击盖章或拖入）；批量对齐 / 分布 / 旋转 / 镜像 / 复制、重新编号、按房间自动填充工位、跨楼层剪贴板、右键菜单、`?` 快捷键速查；撤销重做，自动保存与多人编辑冲突保护。
- **3D**：程序化工位（桌 / 椅 / 显示器 / 键盘，部门色椅背、点亮屏幕、预留 / 停用状态）整层实例化渲染，房间地面按类型贴图（地毯 / 木地板 / 瓷砖 / 混凝土），实例化墙块与门扇，Kenney CC0 低多边形道具（随仓库分发，不访问外网），环境光 + 接触阴影，键盘平移 / 旋转 / 复位。
- **AI（可选，未配置时退化为手动）**：导入户型图 → 视觉模型识别房间 / 墙 / 门与功能标注 → 在图上校对（顶点磁性吸附到图上线条）→ 标定比例 → 生成可编辑的房间 / 墙 / 门；上传家具照片 → 生成参数化 3D 物件（可反馈再生成、可调尺寸）→ 加入物件库「自定义」分类（`/admin/objects` 管理）。支持 Claude API 与内网 OpenAI 兼容网关（GLM-4.6V）。
- **导入 / 导出**：Excel / CSV / 粘贴表格，中英文表头自动识别，预览差异（新建 / 更新 / 落座 / 移动 / 释放 / 离职）后再写入；合并或全量替换两种模式。
- **权限**：超级管理员 → 管理员 → 办公室管理员 → 座位编辑 → 员工；变更审计日志。
- **登录**：华为 UniPortal SSO；本地开发用工号 + 姓名直接登录。

## 技术栈

Next.js 16（App Router）· React 19.2 · TypeScript · Tailwind v4 · Prisma 7 + PostgreSQL · Auth.js v5（自定义华为 provider）· SVG 2D 编辑器（zustand + zundo）· react-three-fiber + drei 3D（meshopt glTF，绝不用 Draco）· 自带 LLM 层（Anthropic / OpenAI 兼容，图片输入）· exceljs / jszip。

## 本地开发

```bash
pnpm install
cp .env.example .env.local      # 填 DATABASE_URL；开发默认 ENABLE_SSO=false ENABLE_DEV_LOGIN=true
pnpm db:migrate                 # 建表
pnpm db:seed                    # 示例数据（2 个办公室、4 层、144 个座位、120 名员工、开发超管 00000001）
pnpm dev                        # http://localhost:3000，用工号 00000001 登录即为超级管理员
```

其他脚本：`pnpm typecheck` · `pnpm lint` · `pnpm test`（vitest）· `pnpm preflight`（部署前自检）· `pnpm db:studio`。

## 目录

```
src/app/(app)/…         登录后的页面（总览、办公室、楼层、员工、管理）
src/app/api/…           路由处理器（offices / floors / seats / employees / imports / exports / audit …）
src/lib/auth/           Auth.js 配置、华为 SSO 适配、建档、门禁（guards.ts）
src/lib/map/            地图数据类型（decor v2：房间 / 锚定门 / 物件库）、zod 校验与 v1 迁移、直角多边形 / 墙派生 / 吸附 / 批量 / 编号 / 填充、物件规格 DSL
src/lib/llm/ src/lib/ai/ LLM 提供方与出口、JSON 提取；户型图识别与照片建模的提示词 / schema / 生成
public/models/          Kenney CC0 glTF 道具（meshopt 压缩）
src/lib/import/         导入解析 / 差异 / 应用 / 模板
src/components/map2d    SVG 查看器与图元        src/components/editor   编辑器
src/components/map3d    R3F 3D 场景            src/components/assign   分配模式
prisma/schema.prisma    数据模型（schema employee_seats）
deploy/ docs/           nginx / systemd / 部署说明
```

## 部署

见 `docs/deploy.md`（子路径 `cari.rnd.huawei.com/seats`，systemd + nginx，复用 ai-community 的 SSO 注册）。AI 功能按 `.env.example` 里的 `LLM_*` 配置（内网：`LLM_PROVIDER=openai-compatible`、`LLM_BASE_URL=https://ai4news.rnd.huawei.com/model/v1`、`LLM_MODEL=zai-org/GLM-4.6V`），不配置则相关按钮退化为手动流程。v1 计划在 `docs/plan.md`，v2（房间 / 蓝图 / 3D / AI）计划在 `docs/plan-v2.md`。

## 导入模板

在办公室页面或员工页面点「导入 Excel」→「下载本办公室模板」。列：`座位编号 | 工号 | 姓名 | 部门 | 备注 | 楼层 | 团队 | 职位 | 邮箱 | 电话 | 状态`，顺序不限；工号是唯一身份；同一编号在多个楼层出现时需填「楼层」；`状态=离职` 表示离职并释放座位；一行只有座位编号 = 清空该座位。
