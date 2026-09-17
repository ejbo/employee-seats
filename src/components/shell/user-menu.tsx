"use client";

import { signOut } from "next-auth/react";
import { LogOut, ChevronDown } from "lucide-react";
import type { Actor } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/labels";
import { withBasePath } from "@/lib/base-path";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ user }: { user: Actor }) {
  async function logout() {
    // 服务端重定向不会自动带 basePath，让浏览器自己跳转到登录页。
    await signOut({ redirect: false });
    window.location.href = withBasePath("/auth/login");
  }
  const initial = user.name.slice(0, 1);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm transition hover:bg-muted">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initial}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{user.name}</div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            {user.w3Id} · {ROLE_LABELS[user.role]}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut className="mr-2 h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
