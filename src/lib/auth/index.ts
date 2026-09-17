import NextAuth, { customFetch, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { cache as reactCache } from "react";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { createHuaweiFetch } from "@/lib/auth/huawei-fetch";
import { buildAuthCookies } from "@/lib/auth/cookies";
import { hostBypassesProxy } from "@/lib/net/proxy";
import { provisionSsoUser, type SsoProfile } from "@/lib/auth/provision";
import type { GlobalRole } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      w3Id: string;
      role: GlobalRole;
      isActive: boolean;
    } & DefaultSession["user"];
  }
  interface User {
    ssoProfile?: SsoProfile;
  }
}

import type {} from "next-auth/jwt";

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    w3Id?: string;
    role?: GlobalRole;
    isActive?: boolean;
    claimsAt?: number;
  }
}

export const isSsoEnabled = env.ENABLE_SSO && !!env.SSO_CLIENT_ID && !!env.SSO_CLIENT_SECRET;
export const isDevLoginEnabled = env.ENABLE_DEV_LOGIN && process.env.NODE_ENV !== "production";

const str = (v: unknown) => (v == null ? "" : String(v).trim());

function buildProviders(): Provider[] {
  const providers: Provider[] = [];

  if (isSsoEnabled) {
    providers.push({
      id: "huawei",
      name: "华为账号",
      type: "oauth",
      clientId: env.SSO_CLIENT_ID,
      clientSecret: env.SSO_CLIENT_SECRET,
      // IDaaS 支持 state（CSRF）但不支持 PKCE/nonce —— 不要让 Auth.js 加上。
      checks: ["state"],
      authorization: {
        url: env.SSO_AUTHORIZE_URL,
        params: { scope: env.SSO_SCOPE, response_type: "code", display: "page" },
      },
      token: env.SSO_ACCESS_TOKEN_URL,
      userinfo: env.SSO_USERINFO_URL,
      // userinfo 只保证有 uuid；工号 uid / 中文名 / 邮箱要在 IDaaS 控制台勾选“附加信息申请”。
      profile(raw: Record<string, unknown>) {
        const uid = str(raw.uid) || str(raw.employeeNumber) || str(raw.uuid) || str(raw.globalUserID);
        const nameCn = str(raw.displayNameCn);
        const nameEn = str(raw.displayNameEn) || str(raw.displayName) || str(raw.cn);
        const email = str(raw.email);
        return {
          id: uid,
          name: nameCn || nameEn || uid,
          email: email || `${uid}@huawei.com`,
          ssoProfile: {
            uid,
            nameCn,
            nameEn,
            email,
            employeeType: str(raw.employeeType),
            phone: str(raw.telephoneNumber),
            raw,
          },
        };
      },
      // 华为的 token/userinfo 不是标准 OAuth2 形状，见 huawei-fetch.ts。
      [customFetch]: createHuaweiFetch({
        clientId: env.SSO_CLIENT_ID!,
        clientSecret: env.SSO_CLIENT_SECRET!,
        scope: env.SSO_SCOPE,
        tokenUrl: env.SSO_ACCESS_TOKEN_URL,
        userinfoUrl: env.SSO_USERINFO_URL,
        verifySsl: env.SSO_VERIFY_SSL,
        // 按主机决定是否走代理：uniportal 是内网主机，代理拒绝内网目标。
        useProxy: env.USE_PROXY && !hostBypassesProxy(new URL(env.SSO_ACCESS_TOKEN_URL).hostname),
        proxyHost: env.HUAWEI_PROXY_HOST,
        proxyPort: env.HUAWEI_PROXY_PORT,
      }),
    } as Provider);
  }

  if (isDevLoginEnabled) {
    providers.push(
      Credentials({
        id: "dev",
        name: "开发登录",
        credentials: {
          w3Id: { label: "工号", type: "text" },
          name: { label: "姓名", type: "text" },
        },
        async authorize(credentials) {
          const w3Id = str(credentials?.w3Id);
          const name = str(credentials?.name);
          if (!/^[A-Za-z]?\d{4,12}$/.test(w3Id)) return null;
          return {
            id: w3Id,
            name: name || w3Id,
            email: `${w3Id}@dev.local`,
            ssoProfile: { uid: w3Id, nameCn: name || w3Id, raw: { dev: true } },
          };
        },
      }),
    );
  }

  return providers;
}

// Auth.js 把 basePath 当作它的挂载点：子路径部署时必须包含 Next 的 basePath，
// 否则回调 URL 少了前缀（见 docs/huawei-sso-deploy.md）。根部署为 "/api/auth"。
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const AUTH_BASE_PATH = `${PUBLIC_BASE_PATH}/api/auth`;

const RAW_AUTH_URL = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
const USE_SECURE_COOKIES = RAW_AUTH_URL
  ? RAW_AUTH_URL.startsWith("https://")
  : process.env.NODE_ENV === "production";

/** JWT 里的角色/停用标记多久后从数据库刷新一次（SessionProvider 每 60s 轮询一次 session 端点）。 */
const ROLE_CLAIMS_TTL_MS = 90_000;

const CLAIMS_SELECT = { id: true, huaweiW3Id: true, displayName: true, role: true, isActive: true } as const;
type ClaimsRow = { id: string; huaweiW3Id: string; displayName: string; role: GlobalRole; isActive: boolean };

const memo: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof reactCache === "function" ? reactCache : (fn) => fn;
const loadClaims = memo(async (userId: string): Promise<ClaimsRow | null> =>
  prisma.user.findUnique({ where: { id: userId }, select: CLAIMS_SELECT }),
);

function applyClaims(token: Record<string, unknown>, row: ClaimsRow) {
  token.uid = row.id;
  token.w3Id = row.huaweiW3Id;
  token.name = row.displayName;
  token.role = row.isActive ? row.role : "USER";
  token.isActive = row.isActive;
  token.claimsAt = Date.now();
}

function claimsStale(token: Record<string, unknown>): boolean {
  const at = token.claimsAt;
  return typeof at !== "number" || Date.now() - at > ROLE_CLAIMS_TTL_MS;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  basePath: AUTH_BASE_PATH,
  trustHost: true,
  session: { strategy: "jwt" },
  providers: buildProviders(),
  useSecureCookies: USE_SECURE_COOKIES,
  // 应用独享的 cookie 名与路径（共享主机上不会与邻居应用互相踩踏）。
  cookies: buildAuthCookies({ basePath: PUBLIC_BASE_PATH, secure: USE_SECURE_COOKIES }),
  // @auth/core 会把这两个路径原样写进 Location，需要自带部署前缀。
  pages: {
    signIn: `${PUBLIC_BASE_PATH}/auth/login`,
    error: `${PUBLIC_BASE_PATH}/auth/error`,
  },
  callbacks: {
    async signIn({ user }) {
      const profile = user.ssoProfile;
      if (!profile?.uid) return false;
      const row = await provisionSsoUser(profile);
      return row.isActive;
    },
    async jwt({ token, user, trigger }) {
      if (user?.ssoProfile?.uid) {
        // 登录：按工号（不是邮箱）找回刚建档的行，写入所有会话要读的字段。
        const row = await prisma.user.findUnique({
          where: { huaweiW3Id: user.ssoProfile.uid },
          select: CLAIMS_SELECT,
        });
        if (row) applyClaims(token, row);
      } else if (typeof token.uid === "string" && (trigger === "update" || claimsStale(token))) {
        const row = await loadClaims(token.uid);
        if (row) applyClaims(token, row);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.uid === "string" ? token.uid : "";
        session.user.w3Id = typeof token.w3Id === "string" ? token.w3Id : "";
        session.user.name = typeof token.name === "string" ? token.name : session.user.name;
        session.user.role = (token.role as GlobalRole | undefined) ?? "USER";
        session.user.isActive = token.isActive !== false;
      }
      return session;
    },
  },
});
