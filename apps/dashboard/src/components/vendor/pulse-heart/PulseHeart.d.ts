/** Types for the supplied PulseHeart (kept as supplied in PulseHeart.jsx; DESIGN.md "Supplied components"). */
export interface PulseHeartProps {
  liked?: boolean;
  defaultLiked?: boolean;
  count?: number;
  onChange?: (liked: boolean) => void;
  showCount?: boolean;
  size?: number;
  likedColor?: string;
  idleColor?: string;
  pillColor?: string;
  textColor?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export default function PulseHeart(props: PulseHeartProps): JSX.Element;
