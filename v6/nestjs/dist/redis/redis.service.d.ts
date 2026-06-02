import { OnModuleDestroy } from '@nestjs/common';
export declare class RedisService implements OnModuleDestroy {
    private subscriber;
    private publisher;
    constructor();
    onModuleDestroy(): void;
    publish(channel: string, payload: object | string): Promise<number>;
    psubscribe(pattern: string, handler: (pattern: string, channel: string, message: string) => void): void;
}
