"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "工具",
    items: [
      ["V", "选择"],
      ["S", "工位"],
      ["R", "房间（拖出矩形）"],
      ["A", "给选中房间添加形状"],
      ["Z", "部门区域"],
      ["W", "墙体（逐点，回车 / 双击结束）"],
      ["D", "门（放到房间边或墙上）"],
      ["T", "文字"],
      ["F", "物件库"],
      ["B", "底图"],
    ],
  },
  {
    title: "编辑",
    items: [
      ["⌘Z / ⇧⌘Z", "撤销 / 重做"],
      ["⌘C / ⌘V", "复制 / 粘贴（跨楼层可用）"],
      ["⌘D", "复制一份"],
      ["⌘A", "全选"],
      ["⌫", "删除"],
      ["⇧R", "顺时针旋转 90°"],
      ["X / ⇧X", "门：切换开向 / 铰链侧"],
      ["方向键 / ⇧方向键", "微移 1 格 / 5 格"],
      ["⌘S", "立即保存"],
    ],
  },
  {
    title: "拖动",
    items: [
      ["拖动", "自动吸附到边、中心、墙面、等间距"],
      ["⌥ 拖动", "关闭吸附"],
      ["⇧ 拖动", "锁定水平 / 垂直方向"],
      ["⌘ 拖房间", "只拖房间壳，不带里面的座位"],
      ["⇧ 点击", "加选 / 减选"],
      ["空格 + 拖动", "平移画布"],
      ["G", "显示 / 隐藏网格"],
      ["?", "本速查"],
    ],
  },
];

export function ShortcutsHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>快捷键速查</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-6">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{g.title}</div>
              <dl className="space-y-1.5">
                {g.items.map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2 text-xs">
                    <dt className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{k}</dt>
                    <dd className="text-foreground/90">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
