import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HouseholdModule } from './household/household.module';
import { TeslaModule } from './tesla/tesla.module';
import { HealthController } from './http/health/health.controller';
import { MeController } from './http/me/me.controller';
import { ConfigModule } from './platform/config/config.module';
import { DatabaseModule } from './platform/database/database.module';
import { LoggingModule } from './platform/logging/logging.module';

@Module({
  imports: [ConfigModule, LoggingModule, DatabaseModule, AuthModule, HouseholdModule, TeslaModule],
  controllers: [HealthController, MeController],
})
export class AppModule {}
