import type { CSSProperties, JSX } from "react";

/** Types for the supplied Aurora (kept as supplied in Aurora.jsx; DESIGN.md "Supplied components"). */
export interface AuroraProps {
  colorStops?: string[];
  amplitude?: number;
  blend?: number;
  speed?: number;
  time?: number;
  height?: number;
  scale?: number;
  glow?: number;
  brightness?: number;
  layers?: number;
  direction?: "top" | "bottom";
  mouseInteraction?: boolean;
  intro?: boolean;
  opacity?: number;
  lightMode?: boolean;
  paused?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
}

declare const Aurora: (props: AuroraProps) => JSX.Element;
export default Aurora;
