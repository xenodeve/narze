import type { JSX, ReactElement } from "react";

/** Types for the supplied BranchedMenu (kept as supplied in BranchedMenu.jsx; DESIGN.md "Supplied components"). */
export interface BranchedMenuItem {
  label: string;
  value?: string;
  icon?: ReactElement | unknown;
  children?: Array<{ value: string; label: string; icon?: ReactElement | unknown }>;
}

export interface BranchedMenuProps {
  items?: BranchedMenuItem[];
  defaultOpen?: number | number[];
  defaultActive?: string;
  onSelect?: (value: string, item: BranchedMenuItem) => void;
  onToggle?: (index: number, open: boolean) => void;
  color?: string;
  accentColor?: string;
  lineColor?: string;
  width?: number;
  rowHeight?: number;
  indent?: number;
  trunk?: number;
  radius?: number;
  lineWidth?: number;
  fontSize?: number;
  drawDuration?: number;
  foldDuration?: number;
  className?: string;
}

declare function BranchedMenu(props: BranchedMenuProps): JSX.Element;
export default BranchedMenu;
