"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";

export function AppToaster() {
  const { theme } = useTheme();
  return <Toaster position="top-center" theme={theme} closeButton richColors duration={3500} />;
}
