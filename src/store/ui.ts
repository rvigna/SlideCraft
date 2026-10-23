import { create } from 'zustand';
import type { LintIssue } from '../model/lint';

export type DialogName = 'image' | 'background' | 'layout' | 'theme' | 'shortcuts' | 'about' | 'new' | 'chart' | 'markdown' | 'motion' | null;

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
  /** Which panel the right sidebar shows; null hides the sidebar */
  panel: 'properties' | 'check' | 'assistant' | null;
  /** Slide thumbnails sidebar */
  showSlides: boolean;
  issues: LintIssue[];
}

export const useUi = create<UiState>(() => ({ dialog: null, dialogSlide: 0, menu: null, busy: null, printing: false, issues: [],
  // Small screens start with the sidebars closed so the slide gets the room
  panel: typeof window !== 'undefined' && window.innerWidth < 1200 ? null : 'properties',
  showSlides: typeof window === 'undefined' || window.innerWidth >= 800,
}));

/** Show a panel, or go back to properties when it's already showing */
export const setPanel = (panel: NonNullable<UiState['panel']>) =>
  useUi.setState(s => ({ panel: s.panel === panel && panel !== 'properties' ? 'properties' : panel }));
export const toggleSidebar = () => useUi.setState(s => ({ panel: s.panel ? null : 'properties' }));
export const toggleSlides = () => useUi.setState(s => ({ showSlides: !s.showSlides }));

export const openDialog = (dialog: DialogName, dialogSlide?: number) =>
  useUi.setState(s => ({ dialog, dialogSlide: dialogSlide ?? s.dialogSlide }));
export const closeDialog = () => useUi.setState({ dialog: null });
export const setBusy = (busy: string | null) => useUi.setState({ busy });
