/** Types for the supplied BellToggle (kept as supplied in BellToggle.jsx; DESIGN.md "Supplied components"). */
import type { ReactNode } from "react";

export interface BellToggleProps {
  offLabel?: string;
  onLabel?: string;
  icon?: ReactNode;
  label?: string;
  color?: string;
  background?: string;
  onColor?: string;
  onBackground?: string;
  size?: "sm" | "md" | "lg";
  radius?: number;
  count?: number;
  badge?: boolean;
  waves?: boolean;
  clapper?: boolean;
  pressed?: boolean;
  defaultPressed?: boolean;
  onChange?: (pressed: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export default function BellToggle(props: BellToggleProps): JSX.Element;
