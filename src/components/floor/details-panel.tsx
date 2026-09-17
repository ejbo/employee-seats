"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Copy, Link2, X } from "lucide-react";
import { toast } from "sonner";
import type { FloorScene } from "@/lib/map/types";
import { seatState } from "@/lib/map/types";
import { SEAT_STATE_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";

export function DetailsPanel({
  scene,
  seatId,
  onClose,
  children,
}: {
  scene: FloorScene;
  seatId: string | null;
  onClose: () => void;
  /** 模式相关的操作区（分配/编辑），由父组件注入 */
  children?: React.ReactNode;
}) {
  const seat = seatId ? scene.seats.find((s) => s.id === seatId) : null;
  const employee = seat?.employeeId ? scene.employees[seat.employeeId] : null;
  const dept = employee?.departmentId ? scene.departments[employee.departmentId] : null;
  const zone = seat?.zoneId ? scene.zones.find((z) => z.id === seat.zoneId) : null;

  function copyLink() {
    if (!seat) return;
    const url = new URL(window.location.href);
    url.searchParams.set("seat", seat.code);
    url.searchParams.delete("mode");
    void navigator.clipboard.writeText(url.toString()).then(
      () => toast.success("已复制座位链接"),
      () => toast.error("复制失败"),
    );
  }

  return (
    <AnimatePresence>
      {seat && (
        <motion.aside
          key={seat.id}
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute inset-y-3 right-3 z-10 flex w-80 max-w-[calc(100%-1.5rem)] flex-col rounded-2xl border border-border bg-surface/95 shadow-pop backdrop-blur"
          data-ui
        >
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">{seat.code}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{SEAT_STATE_LABELS[seatState(seat)]}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {scene.floor.name}
                {zone ? ` · ${zone.name}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" aria-label="复制链接" title="复制座位链接" onClick={copyLink}>
                <Link2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="关闭" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="thin-scrollbar flex-1 overflow-y-auto px-4 py-4">
            {employee ? (
              <div>
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold text-white"
                    style={{ background: dept?.color ?? "#8a8a93" }}
                  >
                    {employee.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{employee.name}</div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => void navigator.clipboard.writeText(employee.employeeNo).then(() => toast.success("已复制工号"))}
                    >
                      {employee.employeeNo}
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-[4.5rem_1fr] gap-y-2 text-sm">
                  <dt className="text-muted-foreground">部门</dt>
                  <dd>
                    {dept ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: dept.color }} />
                        {dept.name}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">团队</dt>
                  <dd>{employee.team || <span className="text-subtle">—</span>}</dd>
                  <dt className="text-muted-foreground">职位</dt>
                  <dd>{employee.title || <span className="text-subtle">—</span>}</dd>
                </dl>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border-strong p-4 text-center text-sm text-muted-foreground">
                {seatState(seat) === "free" ? "空闲座位" : seatState(seat) === "reserved" ? "预留座位" : "已停用"}
                {seat.note && <div className="mt-1 text-xs">{seat.note}</div>}
              </div>
            )}
            {employee && seat.note && <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">备注：{seat.note}</p>}
          </div>
          {children && <div className="border-t border-border px-4 py-3">{children}</div>}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
