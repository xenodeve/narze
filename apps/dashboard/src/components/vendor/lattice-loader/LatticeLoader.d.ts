/** Types for the supplied LatticeLoader (kept as supplied in LatticeLoader.jsx; DESIGN.md "Supplied components"). */
export interface LatticeLoaderProps {
  label?: string;
  doneLabel?: string;
  errorLabel?: string;
  status?: "working" | "done" | "error";
  color?: string;
  doneColor?: string;
  errorColor?: string;
  showTimer?: boolean;
  elapsed?: number;
  className?: string;
}

export default function LatticeLoader(props: LatticeLoaderProps): JSX.Element;
