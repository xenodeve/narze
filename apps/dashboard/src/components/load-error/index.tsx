"use client";

import styles from "./load-error.module.css";

/**
 * Something failed to load (#176): what failed, and a button that tries again. Without an
 * `onRetry`, the button reloads the page, the one retry that always exists.
 */
export function LoadError({ children, onRetry }: { children: string; onRetry?: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <p>{children}</p>
      <button type="button" className={styles.retry} onClick={onRetry ?? (() => window.location.reload())}>
        ลองอีกครั้ง
      </button>
    </div>
  );
}
