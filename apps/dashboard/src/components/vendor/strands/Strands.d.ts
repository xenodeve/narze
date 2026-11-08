import type { CSSProperties, JSX } from "react";

/** Types for the supplied Strands (kept as supplied in Strands.jsx; DESIGN.md "Supplied components"). */
export interface StrandsProps {
  colors?: string[];
  count?: number;
  speed?: number;
  amplitude?: number;
  energy?: number;
  listening?: boolean;
  level?: number;
  interactive?: boolean;
  clickPulse?: boolean;
  intro?: boolean;
  lightMode?: boolean;
  opacity?: number;
  className?: string;
  style?: CSSProperties;
}

export default function Strands(props: StrandsProps): JSX.Element;
