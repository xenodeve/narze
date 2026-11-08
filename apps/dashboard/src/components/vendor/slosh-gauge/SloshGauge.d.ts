/** Types for the supplied SloshGauge (kept as supplied in SloshGauge.jsx; DESIGN.md "Supplied components"). */
export interface SloshGaugeProps {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  interactive?: boolean;
  showValue?: boolean;
  disabled?: boolean;
  /** A hex colour: the label colour on the liquid is computed from it. */
  liquidColor?: string;
  glassColor?: string;
  width?: number;
  height?: number;
  radius?: number;
  ticks?: number;
  viscosity?: number;
  tilt?: number;
  splash?: number;
  unit?: string;
  ariaLabel?: string;
  className?: string;
}

export default function SloshGauge(props: SloshGaugeProps): JSX.Element;
