/**
 * QueueMutex: Simple mutex for generic locking
 * Used to preventing race conditions during queue reconciliation
 */
export class QueueMutex {
  private locks = new Map<string, Promise<void>>();

  /**
   * Acquire a lock for a specific key (e.g., guildId)
   * Returns a release function that MUST be called
   */
  async acquire(key: string): Promise<() => void> {
    let release: () => void = () => {};

    // Create a new promise that resolves when the previous lock is released
    const currentLock = this.locks.get(key) || Promise.resolve();
    
    // Create the next lock promise
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Chain the new lock to the existing one
    // This ensures we wait for the previous lock to release
    const acquiredLock = currentLock.then(() => nextLock);
    
    // Update the map with the new tail of the promise chain
    // We store the wait promise, so the next acquirer waits for THIS lock to release
    this.locks.set(key, nextLock);

    // Wait for the previous lock to be released involved in the chain
    // But we strictly wait for 'currentLock' to resolve before return
    await currentLock;

    return () => {
      release();
      // Cleanup map if this is the last lock? 
      // It's tricky with the promise chain approach in a Map. 
      // Simple implementation: Don't cleanup eagerly to avoid race conditions with setting new locks.
      // A more complex implementation would use a linked list or queue.
      // For now, let's keep it simple as the map size (number of active guilds) is manageable.
    };
  }

  /**
   * Check if a key is currently locked
   */
  isLocked(key: string): boolean {
    // This acts only as a heuristic since promises don't expose state synchronously
    // In a real Mutex class we would track this with a boolean flag per key
    return this.locks.has(key); 
  }
}
