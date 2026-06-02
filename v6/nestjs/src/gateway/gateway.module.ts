import { Module } from '@nestjs/common';
import { PlayerGateway } from './gateway';
import { RedisModule } from '../redis/redis.module';
import { GuildModule } from '../guild/guild.module';

@Module({
  imports: [RedisModule, GuildModule],
  providers: [PlayerGateway],
})
export class GatewayModule {}
