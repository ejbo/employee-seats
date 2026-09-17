/**
 * 部署前自检（不会打印任何取值）：pnpm preflight
 *   ✓ 通过   ✗ 失败（退出码 1）   ! 提醒
 */
import { config as dotenv } from "dotenv";
import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { Client } from "pg";

dotenv({ path: ".env.local", override: false });
dotenv({ path: ".env", override: false });

type Level = "ok" | "fail" | "warn";
const rows: { level: Level; name: string; detail: string }[] = [];
const ok = (name: string, detail = "") => rows.push({ level: "ok", name, detail });
const fail = (name: string, detail = "") => rows.push({ level: "fail", name, detail });
const warn = (name: string, detail = "") => rows.push({ level: "warn", name, detail });

const prod = process.env.NODE_ENV === "production";
const basePath = process.env.NEXT_BASE_PATH ?? "";
const port = Number(process.env.PORT ?? 3200);

async function main() {
  // Node
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) ok("Node 版本", process.versions.node);
  else fail("Node 版本", `${process.versions.node}，需要 ≥ 20`);
  try {
    new TextDecoder("gbk");
    ok("TextDecoder gbk（导入老 Excel/CSV）");
  } catch {
    fail("TextDecoder gbk", "Node 缺少 full-icu，无法解析 gbk 编码的 CSV");
  }

  // env
  let env: typeof import("../src/lib/env").env | null = null;
  try {
    env = (await import("../src/lib/env")).env;
    ok("环境变量校验");
  } catch (e) {
    fail("环境变量校验", (e as Error).message.split("\n").slice(0, 4).join(" "));
  }

  if (env) {
    // AUTH_URL 形状
    try {
      const u = new URL(env.AUTH_URL);
      const want = basePath ? `${basePath}/api/auth` : null;
      if (want && u.pathname.replace(/\/$/, "") !== want) fail("AUTH_URL 与 NEXT_BASE_PATH 匹配", `子路径部署时 AUTH_URL 的路径必须是 ${want}`);
      else if (!basePath && u.pathname !== "/" && u.pathname !== "/api/auth") warn("AUTH_URL 路径", `根部署通常是 https://host 或 https://host/api/auth，当前路径为 ${u.pathname}`);
      else ok("AUTH_URL 形状", basePath ? `子路径 ${basePath}` : "根部署");
      if (prod && u.protocol !== "https:") fail("AUTH_URL 使用 https", "生产环境必须是 https，否则 cookie 不安全且回调地址会被 IDaaS 拒绝");
    } catch {
      fail("AUTH_URL 可解析");
    }
    if (prod && env.SUPER_ADMIN_W3_IDS.length === 0) fail("SUPER_ADMIN_W3_IDS", "生产环境至少要有一个超级管理员工号");
    else ok("SUPER_ADMIN_W3_IDS", `${env.SUPER_ADMIN_W3_IDS.length} 个`);
    if (prod && env.ENABLE_DEV_LOGIN) fail("ENABLE_DEV_LOGIN", "生产环境必须关闭");
    if (!env.ENABLE_SSO) warn("ENABLE_SSO", "未开启 SSO（仅本地开发合理）");

    // DB
    const client = new Client({ connectionString: env.DATABASE_URL.replace(/[?&]schema=[^&]*/, (m) => (m.startsWith("?") ? "?" : "")).replace(/\?&/, "?").replace(/\?$/, "") });
    const schema = /[?&]schema=([^&]+)/.exec(env.DATABASE_URL)?.[1] ?? "public";
    try {
      await client.connect();
      await client.query("select 1");
      ok("数据库连接");
      const s = await client.query("select 1 from information_schema.schemata where schema_name = $1", [schema]);
      if (s.rowCount) ok("数据库 schema 存在", schema);
      else fail("数据库 schema 存在", `schema ${schema} 不存在：CREATE SCHEMA IF NOT EXISTS ${schema}`);
      try {
        const applied = await client.query(`select migration_name from "${schema}"._prisma_migrations where finished_at is not null`);
        const local = existsSync("prisma/migrations") ? readdirSync("prisma/migrations").filter((d) => statSync(path.join("prisma/migrations", d)).isDirectory()) : [];
        const pending = local.filter((m) => !applied.rows.some((r) => r.migration_name === m));
        if (pending.length) fail("数据库迁移", `${pending.length} 个未应用：pnpm db:deploy`);
        else ok("数据库迁移", `${applied.rowCount} 个已应用`);
      } catch {
        fail("数据库迁移", "找不到 _prisma_migrations，请先 pnpm db:deploy");
      }
    } catch (e) {
      fail("数据库连接", (e as Error).message);
    } finally {
      await client.end().catch(() => {});
    }

    // 上传目录
    try {
      mkdirSync(env.UPLOAD_DIR, { recursive: true });
      const probe = path.join(env.UPLOAD_DIR, `.preflight-${Date.now()}`);
      writeFileSync(probe, "ok");
      unlinkSync(probe);
      ok("UPLOAD_DIR 可写", env.UPLOAD_DIR);
    } catch (e) {
      fail("UPLOAD_DIR 可写", (e as Error).message);
    }

    // SSO 主机可达
    if (env.ENABLE_SSO) {
      const host = new URL(env.SSO_ACCESS_TOKEN_URL).hostname;
      const reachable = await new Promise<boolean>((resolve) => {
        const sock = net.connect({ host, port: 443, timeout: 3000 });
        sock.once("connect", () => {
          sock.destroy();
          resolve(true);
        });
        sock.once("error", () => resolve(false));
        sock.once("timeout", () => {
          sock.destroy();
          resolve(false);
        });
      });
      if (reachable) ok("SSO 主机 443 可达", host);
      else fail("SSO 主机 443 可达", `${host}:443 连不上（代理 / 网络策略？）`);
    }
  }

  // 构建产物的 basePath
  const rsf = ".next/required-server-files.json";
  if (existsSync(rsf)) {
    try {
      const built = JSON.parse(readFileSync(rsf, "utf8")).config?.basePath ?? "";
      if (built === basePath) ok("构建产物 basePath", basePath || "(根)");
      else fail("构建产物 basePath", `构建时是「${built || "(根)"}」，当前 NEXT_BASE_PATH 是「${basePath || "(根)"}」，需要重新 build`);
    } catch {
      warn("构建产物 basePath", "无法读取 .next/required-server-files.json");
    }
  } else warn("构建产物", "还没有 .next（尚未 pnpm build）");

  // 端口
  const listening = await new Promise<boolean>((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port, timeout: 1000 });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
    sock.once("timeout", () => {
      sock.destroy();
      resolve(false);
    });
  });
  (listening ? warn : ok)(`端口 ${port}`, listening ? "已有进程在监听（正在运行的服务？）" : "空闲");

  for (const r of rows) console.log(`${r.level === "ok" ? "✓" : r.level === "fail" ? "✗" : "!"} ${r.name}${r.detail ? `  —  ${r.detail}` : ""}`);
  const failed = rows.filter((r) => r.level === "fail").length;
  console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
