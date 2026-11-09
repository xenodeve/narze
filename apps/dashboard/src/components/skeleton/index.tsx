import type { CSSProperties } from "react";
import styles from "./skeleton.module.css";

/**
 * A shimmer block standing in for content that is on its way (#172). Sized by its caller to match
 * what replaces it, so nothing moves when the content lands. Hidden from assistive tech; the
 * region that holds it carries `aria-busy`.
 */
export function Skeleton({ className, style, testId }: { className?: string; style?: CSSProperties; testId?: string }) {
  return (
    <span
      aria-hidden="true"
      className={className ? `${styles.block} ${className}` : styles.block}
      style={style}
      data-testid={testId}
    />
  );
}

/** A page heading and a few hairline rows: the generic shape of a list page while it loads. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label="กำลังโหลด" data-testid="page-skeleton">
      <Skeleton className={styles.title} />
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
        <span key={i} className={styles.row} style={{ animationDelay: `calc(${i} * var(--stagger))` }}>
          <Skeleton className={styles.icon} />
          <Skeleton className={styles.line} style={{ width: `${62 - ((i * 13) % 30)}%` }} />
        </span>
      ))}
    </div>
  );
}
