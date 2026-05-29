/**
 * GlobalRetryLimiter
 * Implements Token Bucket algorithm and Concurrency Limits
 * preventing Client -> Server retry storms
 */

export class GlobalRetryLimiter {
    // Singleton instance
    private static instance: GlobalRetryLimiter;
  
    // Concurrency tracking
    private perGuildActive = new Map<string, number>();
    private globalActive = 0;
  
    // Configuration limits
    private readonly MAX_PER_GUILD = 3;     // Max concurrent retries per guild
    private readonly MAX_GLOBAL = 20;       // Max concurrent retries globally
    private readonly RATE_PER_SECOND = 50;  // Max requests per second (Token Bucket)
    
    // Token Bucket for Rate Limiting
    private tokens: number;
    private lastRefill: number;
    
    private constructor() {
      this.tokens = this.RATE_PER_SECOND;
      this.lastRefill = Date.now();
    }
  
    public static getInstance(): GlobalRetryLimiter {
      if (!GlobalRetryLimiter.instance) {
        GlobalRetryLimiter.instance = new GlobalRetryLimiter();
      }
      return GlobalRetryLimiter.instance;
    }
  
    /**
     * Refill tokens based on time elapsed
     */
    private refillTokens() {
      const now = Date.now();
      const timePassed = now - this.lastRefill;
      const newTokens = timePassed * (this.RATE_PER_SECOND / 1000);
      
      this.tokens = Math.min(this.RATE_PER_SECOND, this.tokens + newTokens);
      this.lastRefill = now;
    }
  
    /**
     * Sleep helper
     */
    private delay(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  
    /**
     * Execute a function with concurrency and rate limits
     */
    async executeWithLimit<T>(
      guildId: string,
      fn: () => Promise<T>
    ): Promise<T> {
      // 1. Wait for Concurrency Slots (Guild & Global)
      while (
        (this.perGuildActive.get(guildId) || 0) >= this.MAX_PER_GUILD ||
        this.globalActive >= this.MAX_GLOBAL
      ) {
        await this.delay(100 + Math.random() * 50); // Jittered wait
      }
      
      // 2. Wait for Rate Limit Token
      while (true) {
        this.refillTokens();
        if (this.tokens >= 1) {
          this.tokens -= 1;
          break;
        }
        await this.delay(50); // Wait for refill
      }
      
      // 3. Acquire Slot
      this.perGuildActive.set(
        guildId, 
        (this.perGuildActive.get(guildId) || 0) + 1
      );
      this.globalActive++;
      
      try {
        // Execute the actual function
        const result = await fn();
        return result;
      } finally {
        // 4. Release Slot
        const currentGuildActive = this.perGuildActive.get(guildId) || 0;
        if (currentGuildActive > 0) {
            this.perGuildActive.set(guildId, currentGuildActive - 1);
        }
        if (this.globalActive > 0) {
            this.globalActive--;
        }
      }
    }
  }
  
