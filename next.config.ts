import type { NextConfig } from "next";

// 子路径部署：构建时设置 NEXT_BASE_PATH（如 "/seats"）。以 "/" 开头、无尾斜杠，
// 并与 AUTH_URL、nginx location 保持一致（见 docs/huawei-sso-deploy.md）。
// 根域名 / 本地开发不设置即可。
const basePath = process.env.NEXT_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  // 同一个变量同时驱动 Next 路由 basePath 和客户端 URL 前缀（withBasePath / AuthProvider / 路由处理器）。
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // exceljs 是重度 CJS 包，保持外部化避免被打进 RSC bundle。
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
