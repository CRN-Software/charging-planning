import { Module } from '@nestjs/common';
import { HealthController } from './http/health/health.controller';
import { ConfigModule } from './platform/config/config.module';
import { DatabaseModule } from './platform/database/database.module';
import { LoggingModule } from './platform/logging/logging.module';

@Module({
  imports: [ConfigModule, LoggingModule, DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
