import { create } from "zustand";

/** 编辑器里跨组件的 UI 开关（对话框等），不进历史、不持久化。 */
interface EditorUiState {
  floorplanWizardOpen: boolean;
  setFloorplanWizardOpen: (open: boolean) => void;
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  floorplanWizardOpen: false,
  setFloorplanWizardOpen: (open) => set({ floorplanWizardOpen: open }),
}));
