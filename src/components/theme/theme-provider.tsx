"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  toggle: () => void;
  setTheme: (t: ThemeMode) => void;
}

const STORAGE_KEY = "seats-theme";
const listeners = new Set<() => void>();

// 真实来源是 <html> 上的 .dark 类：根布局的内联脚本在水合前就按 localStorage / 系统偏好设好了，
// 这里只是读它、改它并通知订阅者。服务端快照固定为 light，由 useSyncExternalStore 处理水合差异。
function readTheme(): ThemeMode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function applyTheme(t: ThemeMode) {
  document.documentElement.classList.toggle("dark", t === "dark");
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* 隐私模式等情况下存储不可用：主题仍会在本次会话生效 */
  }
  listeners.forEach((l) => l());
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as ThemeMode);
  const setTheme = useCallback((t: ThemeMode) => applyTheme(t), []);
  const toggle = useCallback(() => applyTheme(readTheme() === "dark" ? "light" : "dark"), []);
  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
