"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowLeftRight, Loader2, UserMinus, X } from "lucide-react";
import { api, ApiClientError, fetcher } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import type { OfficeCapabilities } from "@/lib/permissions";
import type { FloorPageData } from "@/lib/floors/scene";
import { seatState } from "@/lib/map/types";
import { useFloorUrlState } from "@/hooks/use-floor-url-state";
import { useDragSession } from "@/hooks/use-drag-session";
import { useViewStore } from "@/stores/view-store";
import type { DragPayload } from "@/stores/drag-store";
import { FloorMap2D } from "@/components/map2d/floor-map-2d";
import { FloorEditor } from "@/components/editor/floor-editor";
import { FloorMap3D } from "@/components/map3d/floor-map-3d";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AssignPanel } from "@/components/assign/assign-panel";
import { DragGhost } from "@/components/assign/drag-ghost";
import { EmployeePicker } from "@/components/assign/employee-picker";
import { FloorHeader } from "./floor-header";
import { StatsStrip } from "./stats-strip";
import { DetailsPanel } from "./details-panel";
import { ExportMenu } from "./export-menu";

export type FloorPagePayload = FloorPageData & { viewer: OfficeCapabilities };

type PendingConfirm =
  | { kind: "replace"; seatId: string; employeeId: string; employeeName: string; occupantName: string; seatCode: string; allowMove: boolean }
  | { kind: "release"; seatId: string; employeeName: string; seatCode: string };

export function FloorWorkspace({ initial }: { initial: FloorPagePayload }) {
  const floorId = initial.scene.floor.id;
  const { view, mode, seat: seatParam, update } = useFloorUrlState();
  const { data, mutate } = useSWR<FloorPagePayload>(`/api/floors/${floorId}`, fetcher, {
    fallbackData: initial,
    revalidateOnFocus: true,
    refreshInterval: mode === "edit" ? 0 : 30_000,
  });
  const payload = data ?? initial;
  const { scene, office, floors, viewer, unassigned } = payload;
  const assignMode = mode === "assign" && viewer.canAssign;
  const editMode = mode === "edit" && viewer.canEditLayout;

  const selectedSeatId = useViewStore((s) => s.selectedSeatId);
  const selectSeat = useViewStore((s) => s.selectSeat);
  const requestFlyTo = useViewStore((s) => s.requestFlyTo);
  const reset = useViewStore((s) => s.reset);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  /** 「移动/交换到…」：等待点击目标座位 */
  const [moveFromRaw, setMoveFrom] = useState<string | null>(null);
  // 只在分配模式下生效（切换模式时由 onModeChange 清掉）
  const moveFrom = assignMode ? moveFromRaw : null;

  // 切换楼层时清空交互状态
  useEffect(() => () => reset(), [floorId, reset]);

  // 深链接 ?seat=CODE：首次加载定位并选中
  const consumedSeatRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seatParam || consumedSeatRef.current === seatParam) return;
    const seat = scene.seats.find((s) => s.code.toUpperCase() === seatParam.toUpperCase());
    if (!seat) return;
    consumedSeatRef.current = seatParam;
    selectSeat(seat.id);
    requestFlyTo(seat.id);
  }, [seatParam, scene.seats, selectSeat, requestFlyTo]);

  // ── 分配动作 ────────────────────────────────────────────────────────────
  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
        toast.success(label);
        await mutate();
        return true;
      } catch (err) {
        toast.error(err instanceof ApiClientError ? errorMessage(err.code, "操作失败") : "操作失败");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [mutate],
  );

  const assign = useCallback(
    (seatId: string, employeeId: string, opts: { allowMove?: boolean; allowReplace?: boolean } = {}) => {
      const seat = scene.seats.find((s) => s.id === seatId);
      const emp = scene.employees[employeeId] ?? unassigned.find((e) => e.id === employeeId);
      const moving = Boolean(emp && scene.seats.some((s) => s.employeeId === employeeId));
      return run(`${emp?.name ?? "员工"} 已${moving ? "移到" : "落座"} ${seat?.code ?? ""}`, () =>
        api(`/api/seats/${seatId}/assign`, { method: "POST", json: { employeeId, ...opts } }),
      );
    },
    [run, scene.employees, scene.seats, unassigned],
  );

  const release = useCallback(
    (seatId: string) => {
      const seat = scene.seats.find((s) => s.id === seatId);
      return run(`已释放座位 ${seat?.code ?? ""}`, () => api(`/api/seats/${seatId}/release`, { method: "POST" }));
    },
    [run, scene.seats],
  );

  const swap = useCallback(
    (seatId: string, otherSeatId: string) => {
      const a = scene.seats.find((s) => s.id === seatId);
      const b = scene.seats.find((s) => s.id === otherSeatId);
      return run(`已交换 ${a?.code ?? ""} 与 ${b?.code ?? ""}`, () =>
        api(`/api/seats/${seatId}/swap`, { method: "POST", json: { otherSeatId } }),
      );
    },
    [run, scene.seats],
  );

  /** 把 employeeId（可能来自别的座位）放到 targetSeatId 上，按目标状态决定：分配 / 移动 / 交换 / 挤位确认 */
  const placeEmployee = useCallback(
    (targetSeatId: string, employeeId: string, fromSeatId: string | null) => {
      const target = scene.seats.find((s) => s.id === targetSeatId);
      if (!target || target.id === fromSeatId) return;
      if (seatState(target) === "reserved" || seatState(target) === "disabled") {
        toast.error(errorMessage("seat_not_assignable"));
        return;
      }
      const empName = scene.employees[employeeId]?.name ?? unassigned.find((e) => e.id === employeeId)?.name ?? "该员工";
      if (target.employeeId) {
        if (fromSeatId) {
          void swap(fromSeatId, targetSeatId);
        } else {
          const occupant = scene.employees[target.employeeId];
          setConfirm({
            kind: "replace",
            seatId: targetSeatId,
            employeeId,
            employeeName: empName,
            occupantName: occupant?.name ?? "当前占用者",
            seatCode: target.code,
            allowMove: Boolean(fromSeatId),
          });
        }
        return;
      }
      void assign(targetSeatId, employeeId, { allowMove: true });
    },
    [assign, scene.employees, scene.seats, swap, unassigned],
  );

  useDragSession(
    useCallback(
      (drag: DragPayload, overSeatId: string | null) => {
        if (!overSeatId) return;
        placeEmployee(overSeatId, drag.employeeId, drag.fromSeatId);
      },
      [placeEmployee],
    ),
  );

  // ── 选择 ────────────────────────────────────────────────────────────────
  const onSeatClick = useCallback(
    (id: string) => {
      if (moveFrom) {
        const from = scene.seats.find((s) => s.id === moveFrom);
        if (from?.employeeId && id !== moveFrom) placeEmployee(id, from.employeeId, moveFrom);
        setMoveFrom(null);
        return;
      }
      const seat = scene.seats.find((s) => s.id === id);
      const next = selectedSeatId === id ? null : id;
      // 点击选中只更新 URL，不触发深链接的飞行定位
      consumedSeatRef.current = next ? (seat?.code ?? null) : null;
      selectSeat(next);
      update({ seat: next ? (seat?.code ?? null) : null });
    },
    [moveFrom, placeEmployee, scene.seats, selectSeat, selectedSeatId, update],
  );

  const onBackgroundClick = useCallback(() => {
    if (moveFrom) {
      setMoveFrom(null);
      return;
    }
    if (selectedSeatId) {
      selectSeat(null);
      update({ seat: null });
    }
  }, [moveFrom, selectSeat, selectedSeatId, update]);

  useEffect(() => {
    if (!moveFrom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoveFrom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveFrom]);

  const selectedSeat = selectedSeatId ? scene.seats.find((s) => s.id === selectedSeatId) : null;
  const selectedState = selectedSeat ? seatState(selectedSeat) : null;

  return (
    <div className="flex h-full flex-col">
      <FloorHeader
        office={office}
        floors={floors}
        floorId={floorId}
        floorName={scene.floor.name}
        view={view}
        mode={mode}
        caps={viewer}
        onViewChange={(v) => update({ view: v })}
        onModeChange={(m) => {
          setMoveFrom(null);
          update({ mode: m });
        }}
        right={<ExportMenu scene={scene} officeName={office.name} svgRef={svgRef} />}
      />
      <StatsStrip scene={scene} />
      <div className="relative min-h-0 flex-1">
        {editMode ? (
          <FloorEditor payload={payload} svgRef={svgRef} onSaved={(p) => void mutate(p, { revalidate: false })} />
        ) : view === "3d" ? (
          <FloorMap3D scene={scene} onSeatClick={onSeatClick} />
        ) : (
          <FloorMap2D scene={scene} assignMode={assignMode} svgRef={svgRef} onSeatClick={onSeatClick} onBackgroundClick={onBackgroundClick} />
        )}

        {assignMode && view === "2d" && <AssignPanel employees={unassigned} departments={scene.departments} onCreated={() => void mutate()} />}

        {moveFrom && (
          <div data-ui className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs shadow-pop">
            <ArrowLeftRight className="h-3.5 w-3.5 text-info" />
            点击目标座位：空位 = 移动，有人 = 交换
            <button type="button" className="ml-1 rounded-full p-0.5 hover:bg-muted" onClick={() => setMoveFrom(null)} aria-label="取消">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {!editMode && (
        <DetailsPanel
          scene={scene}
          seatId={selectedSeatId}
          onClose={() => {
            selectSeat(null);
            update({ seat: null });
          }}
        >
          {assignMode && selectedSeat && (
            <div className="space-y-2">
              {selectedState === "occupied" && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => setMoveFrom(selectedSeat.id)}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    移动 / 交换…
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-danger hover:text-danger"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        kind: "release",
                        seatId: selectedSeat.id,
                        seatCode: selectedSeat.code,
                        employeeName: scene.employees[selectedSeat.employeeId!]?.name ?? "",
                      })
                    }
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                    释放座位
                  </Button>
                </div>
              )}
              {selectedState === "free" && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">分配员工到 {selectedSeat.code}</div>
                  <EmployeePicker
                    employees={unassigned}
                    departments={scene.departments}
                    compact
                    onPick={(employeeId) => void assign(selectedSeat.id, employeeId)}
                  />
                </div>
              )}
              {(selectedState === "reserved" || selectedState === "disabled") && (
                <p className="text-xs text-muted-foreground">预留 / 停用座位不能分配，可在编辑模式修改座位状态。</p>
              )}
            </div>
          )}
        </DetailsPanel>
        )}
      </div>

      <DragGhost />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.kind === "replace"
            ? `把 ${confirm.employeeName} 安排到 ${confirm.seatCode}？`
            : confirm?.kind === "release"
              ? `释放座位 ${confirm.seatCode}？`
              : ""
        }
        description={
          confirm?.kind === "replace"
            ? `座位 ${confirm.seatCode} 目前由 ${confirm.occupantName} 使用，确认后 ${confirm.occupantName} 将变为未落座。`
            : confirm?.kind === "release"
              ? `${confirm.employeeName} 将变为未落座。`
              : undefined
        }
        confirmLabel={confirm?.kind === "release" ? "释放" : "确认"}
        destructive={confirm?.kind === "release"}
        pending={busy}
        onConfirm={async () => {
          if (!confirm) return;
          const ok =
            confirm.kind === "replace"
              ? await assign(confirm.seatId, confirm.employeeId, { allowReplace: true, allowMove: confirm.allowMove })
              : await release(confirm.seatId);
          if (ok) setConfirm(null);
        }}
      />
    </div>
  );
}
