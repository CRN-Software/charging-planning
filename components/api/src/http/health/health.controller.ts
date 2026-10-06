import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import type { Health } from '@charging/contracts';
import { Kysely, sql } from 'kysely';
import { AppConfig } from '@/platform/config/config.module';
import type { Database } from '@/platform/database/database.types';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly config: AppConfig,
  ) {}

  /** Used by the deploy smoke test: the version proves the new release is the one answering. */
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<Health> {
    try {
      await sql`select 1`.execute(this.db);
    } catch {
      throw new ServiceUnavailableException({ status: 'degraded', db: 'down' });
    }
    return { status: 'ok', db: 'up', version: this.config.get('APP_VERSION') };
  }
}
