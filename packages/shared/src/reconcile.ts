export type Reconcile = "apply" | "drop" | "refetch";

/**
 * What a client does with an incoming Guild event given its local Queue Revision (ADR-0007):
 * drop anything older, refetch the snapshot when revisions were skipped, otherwise apply. A new
 * Bot epoch (the Bot restarted, revisions start over) always applies.
 */
export function reconcile(localRevision: number | null, eventRevision: number, newEpoch = false): Reconcile {
  if (localRevision === null || newEpoch) return "apply";
  if (eventRevision < localRevision) return "drop";
  return eventRevision > localRevision + 1 ? "refetch" : "apply";
}
