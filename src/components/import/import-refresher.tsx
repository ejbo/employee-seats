"use client";

import { useRouter } from "next/navigation";
import { ImportWizard } from "./import-wizard";

/** 员工页上的导入入口：导入完成后刷新页面数据。 */
export function ImportRefresher({ defaultOfficeId }: { defaultOfficeId?: string }) {
  const router = useRouter();
  return <ImportWizard defaultOfficeId={defaultOfficeId} onDone={() => router.refresh()} />;
}
