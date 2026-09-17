# 座位图（employee-seats）

行政 / 管理部门用的办公室座位图：每个办公室是一张可编辑的「地图」，员工可批量导入并按座位编号落座，所有华为账号登录的同事都能查看、搜人；同一份数据提供 2D 平面图与 3D 立体视图。

## 功能

- **查看**：研究所 → 城市 → 办公室 → 楼层；全局搜索姓名 / 工号 / 座位号并飞行定位；按部门淡色区域与图例筛选；悬停 / 点击看详情；`?seat=A12` 深链接；导出 PNG / SVG / Excel。
- **分配**（座位编辑）：把未落座员工拖到座位上，移动 / 交换 / 释放；离职即释放。
- **编辑**（办公室管理员）：自由画布 + 吸附网格，工位 / 区域 / 墙 / 门 / 文字 / 会议室等家具，阵列批量生成工位并自动编号，上传平面图做底图，撤销重做，自动保存与多人编辑冲突保护。
- **导入 / 导出**：Excel / CSV / 粘贴表格，中英文表头自动识别，预览差异（新建 / 更新 / 落座 / 移动 / 释放 / 离职）后再写入；合并或全量替换两种模式。
- **权限**：超级管理员 → 管理员 → 办公室管理员 → 座位编辑 → 员工；变更审计日志。
- **登录**：华为 UniPortal SSO；本地开发用工号 + 姓名直接登录。

## 技术栈

Next.js 16（App Router）· React 19.2 · TypeScript · Tailwind v4 · Prisma 7 + PostgreSQL · Auth.js v5（自定义华为 provider）· SVG 2D 编辑器（zustand + zundo）· react-three-fiber 3D · exceljs / jszip。

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
src/lib/map/            地图数据类型、zod 校验、几何、diff、导出
src/lib/import/         导入解析 / 差异 / 应用 / 模板
src/components/map2d    SVG 查看器与图元        src/components/editor   编辑器
src/components/map3d    R3F 3D 场景            src/components/assign   分配模式
prisma/schema.prisma    数据模型（schema employee_seats）
deploy/ docs/           nginx / systemd / 部署说明
```

## 部署

见 `docs/deploy.md`（子路径 `cari.rnd.huawei.com/seats`，systemd + nginx，复用 ai-community 的 SSO 注册）。

## 导入模板

在办公室页面或员工页面点「导入 Excel」→「下载本办公室模板」。列：`座位编号 | 工号 | 姓名 | 部门 | 备注 | 楼层 | 团队 | 职位 | 邮箱 | 电话 | 状态`，顺序不限；工号是唯一身份；同一编号在多个楼层出现时需填「楼层」；`状态=离职` 表示离职并释放座位；一行只有座位编号 = 清空该座位。
