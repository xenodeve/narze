import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  // Two instances required: ioredis cannot publish while in subscribe mode
  private subscriber: Redis;
  private publisher: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.subscriber = new Redis(url);
    this.publisher = new Redis(url);
  }

  onModuleDestroy() {
    this.subscriber.disconnect();
    this.publisher.disconnect();
  }

  async publish(channel: string, payload: object | string) {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return this.publisher.publish(channel, message);
  }

  psubscribe(pattern: string, handler: (pattern: string, channel: string, message: string) => void) {
    this.subscriber.psubscribe(pattern);
    this.subscriber.on('pmessage', handler);
  }
}
