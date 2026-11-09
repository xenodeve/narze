import type { ReactNode } from "react";
import styles from "./template.module.css";

/**
 * Re-mounts on every page change, below the App shell (#172), so each page enters with DESIGN.md's
 * `page` motion while the top bar and the sidebar stay still.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page} data-testid="page">
      {children}
    </div>
  );
}
