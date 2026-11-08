import type { JSX } from "react";

/** Types for the supplied VoicePill (kept as supplied in VoicePill.jsx; DESIGN.md "Supplied components"). */
export interface VoicePillProps {
  accentColor?: string;
  iconColor?: string;
  background?: string;
  size?: number;
  shape?: "pill" | "rounded";
  reach?: number;
  showTime?: boolean;
  waveform?: boolean;
  slideToCancel?: boolean;
  cancelDistance?: number;
  attack?: number;
  release?: number;
  sensitivity?: number;
  floor?: number;
  openDuration?: number;
  pressScale?: number;
  mode?: "auto" | "toggle" | "hold";
  holdAfter?: number;
  reactive?: "simulated" | "mic" | "none";
  disabled?: boolean;
  ariaLabel?: string;
  onStart?: (info: { source: string }) => void;
  onStop?: (info: { reason: string; duration: number }) => void;
  className?: string;
}

export default function VoicePill(props: VoicePillProps): JSX.Element;
