import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { auth } from "@/lib/auth";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { AppToaster } from "@/components/app-toaster";

export const metadata: Metadata = {
  title: { default: "座位图", template: "%s · 座位图" },
  description: "办公室座位图：查看与维护员工座位",
};

// 在水合前就把 .dark 打上，避免深色偏好用户看到一闪白屏。
const themeScript = `(function(){try{var t=localStorage.getItem("seats-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <AuthProvider session={session}>
            {children}
            <AppToaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
