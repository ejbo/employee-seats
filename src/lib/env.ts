import { z } from "zod";

/** 宽松布尔：true/1/yes/on（不区分大小写、容忍空白）。 */
const bool = (def: "true" | "false" = "false") =>
  z
    .string()
    .default(def)
    .transform((v) => ["true", "1", "yes", "on"].includes(v.trim().toLowerCase()));

/** 带默认值的正整数；空值/乱码回退到默认值而不是 NaN。 */
const num = (def: number, min = 0) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number.parseInt((v ?? "").trim(), 10);
      return Number.isFinite(n) && n >= min ? n : def;
    });

/** 可选字符串；`FOO=`（存在但为空）视为未设置。 */
const optStr = () =>
  z
    .string()
    .optional()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : undefined;
    });

/** 逗号分隔列表。 */
const list = () =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );

const schema = z
  .object({
    DATABASE_URL: z.url(),

    AUTH_SECRET: z.string().min(16),
    // 子路径部署时必须以 /api/auth 结尾（见 .env.example）。
    AUTH_URL: z.url().default("http://localhost:3000"),

    // ── 华为 SSO ────────────────────────────────────────────────────────────
    ENABLE_SSO: bool(),
    SSO_CLIENT_ID: optStr(),
    SSO_CLIENT_SECRET: optStr(),
    SSO_AUTHORIZE_URL: z.url().default("https://uniportal.huawei.com/saaslogin1/oauth2/authorize"),
    SSO_ACCESS_TOKEN_URL: z.url().default("https://uniportal.huawei.com/saaslogin1/oauth2/accesstoken"),
    SSO_USERINFO_URL: z.url().default("https://uniportal.huawei.com/saaslogin1/oauth2/userinfo"),
    SSO_SCOPE: z.string().default("base.profile"),
    SSO_VERIFY_SSL: bool(),

    // ── 出口代理（src/lib/net/proxy.ts）────────────────────────────────────
    USE_PROXY: bool(),
    HUAWEI_PROXY_HOST: optStr(),
    HUAWEI_PROXY_PORT: optStr(),
    PROXY_BYPASS: optStr(),
    PROXY_TLS_INSECURE: bool(),
    PROXY_CA_FILE: optStr(),
    INTERNAL_TLS_INSECURE: bool(),
    HTTPS_PROXY: optStr(),
    https_proxy: optStr(),
    HTTP_PROXY: optStr(),
    http_proxy: optStr(),
    NO_PROXY: optStr(),
    no_proxy: optStr(),

    // ── 本地开发登录（无 UniPortal 时用工号+姓名直接登录）────────────────────
    ENABLE_DEV_LOGIN: bool(),

    // ── 权限引导：这些工号首次登录即为超级管理员 ──────────────────────────────
    SUPER_ADMIN_W3_IDS: list(),

    // ── AI（户型图识别 / 照片生成物件；未配置时相关功能退化为手动）─────────────
    // LLM_PROVIDER=anthropic（开发机，配 ANTHROPIC_API_KEY，公网需 LLM_USE_PROXY=true）
    // LLM_PROVIDER=openai-compatible（内网网关 https://ai4news.rnd.huawei.com/model/v1，模型 zai-org/GLM-4.6V，直连）
    LLM_PROVIDER: optStr(),
    LLM_BASE_URL: optStr(),
    LLM_API_KEY: optStr(),
    LLM_MODEL: optStr(),
    LLM_USE_PROXY: bool(),
    ANTHROPIC_API_KEY: optStr(),

    // ── 文件与导入 ──────────────────────────────────────────────────────────
    UPLOAD_DIR: z.string().default("./storage"),
    MAX_UPLOAD_MB: num(20, 1),
    MAX_IMPORT_ROWS: num(5000, 1),
  })
  .superRefine((e, ctx) => {
    if (e.ENABLE_SSO && (!e.SSO_CLIENT_ID || !e.SSO_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["SSO_CLIENT_ID"],
        message: "ENABLE_SSO=true 时必须设置 SSO_CLIENT_ID 与 SSO_CLIENT_SECRET",
      });
    }
    // 注意：`next build` 时 NODE_ENV 也是 production（本机 .env.local 常带 ENABLE_DEV_LOGIN=true），
    // 所以这里只提醒不报错；真正的生产门槛由 auth/index.ts 的 isDevLoginEnabled 和 scripts/preflight.ts 把守。
    if (e.ENABLE_DEV_LOGIN && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
      console.warn("[env] ENABLE_DEV_LOGIN=true 在生产环境会被忽略；部署前请关闭。");
    }
    if (!e.ENABLE_SSO && !e.ENABLE_DEV_LOGIN) {
      ctx.addIssue({
        code: "custom",
        path: ["ENABLE_SSO"],
        message: "至少启用一种登录方式：ENABLE_SSO=true 或 ENABLE_DEV_LOGIN=true",
      });
    }
  });

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`环境变量无效：\n${details}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof schema>;
