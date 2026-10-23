import { create } from 'zustand';

export type DialogName = 'image' | 'background' | 'layout' | 'theme' | 'shortcuts' | 'about' | 'new' | null;

export interface MenuDef {
  label: string;
  shortcut?: string;
  icon?: React.ElementType;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  children?: MenuItem[];
}
export type MenuItem = MenuDef | 'divider';

interface UiState {
  dialog: DialogName;
  /** Slide the background/layout dialog acts on */
  dialogSlide: number;
  menu: { x: number; y: number; items: MenuItem[]; label: string } | null;
  busy: string | null;
  /** Render every slide for printing / Save as PDF */
  printing: boolean;
}

export const useUi = create<UiState>(() => ({ dialog: null, dialogSlide: 0, menu: null, busy: null, printing: false }));

export const openDialog = (dialog: DialogName, dialogSlide?: number) =>
  useUi.setState(s => ({ dialog, dialogSlide: dialogSlide ?? s.dialogSlide }));
export const closeDialog = () => useUi.setState({ dialog: null });
export const setBusy = (busy: string | null) => useUi.setState({ busy });
