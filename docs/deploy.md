# 部署：cari.rnd.huawei.com/seats

目标：子路径 `/seats`、端口 3200、systemd + nginx、共享 Postgres 实例上的独立 schema `employee_seats`、复用 ai-community 的华为 SSO 注册（D2：回调是已备案域名的子目录，无需新备案）。

## 0. 前置

- Node ≥ 20（建议与 ai-community 同一个 nvm node）、pnpm、能访问 Postgres。
- 仓库放在 `/opt/cari_projects/employee-seats`（不要放 `$HOME`：目录 700 会让 nginx 读静态资源 403）。
- DBA 执行一次：`CREATE SCHEMA IF NOT EXISTS employee_seats; GRANT ALL ON SCHEMA employee_seats TO <app_role>;`

## 1. 环境变量（`.env`，chmod 600，不进 git）

```
DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB?schema=employee_seats&connection_limit=10"
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://cari.rnd.huawei.com/seats/api/auth      # 必须以 /api/auth 结尾
ENABLE_SSO=true
SSO_CLIENT_ID=<ai-community 同款>
SSO_CLIENT_SECRET=<ai-community 同款>
SSO_VERIFY_SSL=false                                     # 或 systemd 里配 NODE_EXTRA_CA_CERTS
USE_PROXY=false                                          # 本应用不出外网
ENABLE_DEV_LOGIN=false
SUPER_ADMIN_W3_IDS=<行政负责人工号,逗号分隔>
UPLOAD_DIR=./storage
```

`NEXT_BASE_PATH=/seats` 不放 `.env`（它是构建期变量）：构建命令和 systemd 单元里各设一次。

## 2. 构建与迁移

```bash
pnpm install --frozen-lockfile
pnpm db:deploy                       # prisma migrate deploy
NEXT_BASE_PATH=/seats pnpm build     # 会先 prisma generate
pnpm preflight                       # 全绿再继续
```

## 3. systemd

`deploy/employee-seats.service` → `/etc/systemd/system/`，改 `User/Group`、`WorkingDirectory`、`ExecStart` 里的 node 路径，然后
`sudo systemctl daemon-reload && sudo systemctl enable --now employee-seats`。
直接验证：`curl -sI http://127.0.0.1:3200/seats/auth/login` 应为 200。

## 4. nginx

`deploy/employee-seats.nginx.conf` 的 PART A 放 `http{}`，PART B 放 cari 的 `server{}` 且在 `location /` 之前；
改 `alias` 里的仓库路径。`sudo nginx -t`，再 `sudo kill -HUP <master pid>`（`ps -o pid,args -C nginx` 找 master；不要 `systemctl restart nginx`）。
验证：`curl -sI https://cari.rnd.huawei.com/seats/auth/login` 200，页面里的静态资源都在 `/seats/_next/static/` 下。

## 5. SSO 往返

浏览器打开 `https://cari.rnd.huawei.com/seats/` → 跳 `uniportal.huawei.com/saaslogin1/oauth2/authorize?...&state=...` → 回到
`/seats/api/auth/callback/huawei` → 落在 `/seats/`。登出后停留在 `/seats/auth/login`，不会跳到 localhost 或宿主根路径。

常见故障（详见 `docs/huawei-sso-deploy.md`）：

| 现象 | 原因 |
|---|---|
| `UnknownAction: Cannot parse action at /api/auth/...` | 构建时没带 `NEXT_BASE_PATH`，或 `AUTH_URL` 没以 `/api/auth` 结尾 |
| 登录后落到宿主根路径（别的应用） | nginx `proxy_pass` 带了尾斜杠，或客户端 basePath 未生效（未重新 build） |
| `InvalidCheck: state value could not be parsed` | 从别名域名发起登录；nginx 的 canonical 301 缺失 |
| IDaaS `E_10004` | 回调地址是 http（缺 `X-Forwarded-Proto https`）或域名/端口与备案不符 |
| `/seats` 无限重定向 | `location = /seats` 写成了 301 |

## 6. 升级

```bash
git pull && pnpm install --frozen-lockfile && pnpm db:deploy && NEXT_BASE_PATH=/seats pnpm build && sudo systemctl restart employee-seats
```

## 7. 根域名部署（备选）

若改用独立域名：`AUTH_URL=https://seats.rnd.huawei.com`（无子路径），不设 `NEXT_BASE_PATH`，nginx 用普通 `location /`，并在 IDaaS 控制台把新域名加进「应用域名」或注册新的 client_id。代码无需改动。
