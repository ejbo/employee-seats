"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/lib/labels";
import { computeLayoutOps, type LayoutSnapshot } from "@/lib/map/diff";
import { snapshotFromScene, useEditorStore } from "@/stores/editor-store";
import type { FloorPagePayload } from "@/components/floor/floor-workspace";

const DEBOUNCE_MS = 1500;

/**
 * 编辑器自动保存：脏了 1.5s 后保存；⌘S / 标签页隐藏 / 卸载前立即保存；
 * 409 版本冲突时交给调用方展示对话框（重新加载 / 强制覆盖）。
 */
export function useAutosave({ floorId, enabled, onSaved }: { floorId: string; enabled: boolean; onSaved: (p: FloorPagePayload) => void }) {
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const onSavedRef = useRef(onSaved);
  const [conflict, setConflict] = useState<{ currentVersion: number } | null>(null);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const save = useCallback(
    async (opts: { base?: LayoutSnapshot; baseVersion?: number } = {}): Promise<boolean> => {
      const st = useEditorStore.getState();
      const base = opts.base ?? st.lastSaved;
      if (!base || inFlightRef.current || st.floorId !== floorId) return false;
      const snapshot: LayoutSnapshot = { elements: st.elements, order: st.order, meta: st.meta };
      const ops = computeLayoutOps(base, snapshot);
      if (ops.length === 0) {
        st.setSaveStatus("saved");
        return true;
      }
      inFlightRef.current = true;
      st.setSaveStatus("saving");
      try {
        const res = await api<FloorPagePayload & { version: number }>(`/api/floors/${floorId}/layout`, {
          method: "PUT",
          json: { baseVersion: opts.baseVersion ?? st.baseVersion, ops },
        });
        useEditorStore.getState().markSaved(res.version, snapshot);
        onSavedRef.current(res);
        setConflict(null);
        return true;
      } catch (err) {
        const cur = useEditorStore.getState();
        if (err instanceof ApiClientError && err.code === "version_conflict") {
          cur.setSaveStatus("conflict");
          setConflict({ currentVersion: Number(err.body?.currentVersion ?? 0) });
        } else {
          cur.setSaveStatus("error");
          toast.error(err instanceof ApiClientError ? errorMessage(err.code, "保存失败") : "保存失败");
        }
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [floorId],
  );

  // 脏了就排队
  useEffect(() => {
    if (!enabled || saveStatus !== "dirty") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, saveStatus, save]);

  // 保存失败后若又有改动，会重新变 dirty → 再次排队；保存过程中的改动在 markSaved 里判定为 dirty

  // 离开前尽量保存
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && useEditorStore.getState().saveStatus === "dirty") void save();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useEditorStore.getState().saveStatus;
      if (s === "dirty" || s === "saving") {
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled, save]);

  /** 冲突：放弃本地改动，加载服务器版本 */
  const reload = useCallback(async () => {
    const payload = await api<FloorPagePayload>(`/api/floors/${floorId}`);
    useEditorStore.getState().restoreFromServer(payload.scene);
    onSavedRef.current(payload);
    setConflict(null);
    toast.success("已加载最新布局");
  }, [floorId]);

  /** 冲突：以本地为准覆盖服务器版本（按服务器当前状态重新计算差异） */
  const force = useCallback(async () => {
    const payload = await api<FloorPagePayload>(`/api/floors/${floorId}`);
    const serverSnap = snapshotFromScene(payload.scene);
    const ok = await save({ base: serverSnap, baseVersion: payload.scene.floor.version });
    if (ok) toast.success("已覆盖为本地版本");
  }, [floorId, save]);

  return { saveNow: () => void save(), conflict, reload, force };
}
