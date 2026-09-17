"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import type { OfficeGroup } from "@/lib/offices/queries";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./sidebar-nav";

/** 小屏幕上的侧栏抽屉（桌面端侧栏常驻，这个按钮 md 以上隐藏）。 */
export function MobileNav(props: { groups: OfficeGroup[]; admin: boolean }) {
  // 路由变化时整个抽屉重新挂载 → 自然收起（不用 effect 里 setState）
  const pathname = usePathname();
  return <MobileNavInner key={pathname} {...props} />;
}

function MobileNavInner({ groups, admin }: { groups: OfficeGroup[]; admin: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="菜单">
          <Menu className="h-5 w-5" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content className="thin-scrollbar fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-border bg-surface shadow-pop data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left">
          <DialogPrimitive.Title className="sr-only">导航</DialogPrimitive.Title>
          <div className="flex h-14 items-center justify-between border-b border-border px-4 text-sm font-semibold">
            座位图
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="关闭">
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <SidebarNav groups={groups} admin={admin} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
