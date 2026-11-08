/** Types for the supplied SquishSwitch (kept as supplied in SquishSwitch.jsx; DESIGN.md "Supplied components"). */
export interface SquishSwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  trackColor?: string;
  trackOnColor?: string;
  thumbColor?: string;
  thumbOnColor?: string;
  width?: number;
  height?: number;
  radius?: number;
  ariaLabel?: string;
  className?: string;
  id?: string;
}

export default function SquishSwitch(props: SquishSwitchProps): JSX.Element;
