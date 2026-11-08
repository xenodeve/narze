import type { CSSProperties, JSX, ReactNode } from "react";

/** Types for the supplied SwipeRow (kept as supplied in SwipeRow.jsx; DESIGN.md "Supplied components"). */
export interface SwipeRowAction {
  id: string;
  label: string;
  icon?: unknown;
  color?: string;
  onSelect?: () => void;
  dismiss?: boolean;
}

export interface SwipeRowProps {
  children?: ReactNode;
  actions?: SwipeRowAction[];
  actionColor?: string;
  drawerColor?: string;
  rowColor?: string;
  textColor?: string;
  height?: number;
  radius?: number;
  actionWidth?: number;
  direction?: "left" | "right";
  snapBounce?: number;
  resistance?: number;
  collapseMs?: number;
  commitAt?: number;
  fullSwipe?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: (action: SwipeRowAction) => void;
  onCommit?: (action: SwipeRowAction) => void;
  closeOnAction?: boolean;
  haptic?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

declare function SwipeRow(props: SwipeRowProps): JSX.Element;
export default SwipeRow;
