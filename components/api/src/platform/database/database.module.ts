import { Global, Logger, Module } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Kysely } from 'kysely';
import { AppConfig } from '../config/config.module';
import { createDatabase, MIGRATIONS_DIR } from './database.factory';
import type { Database } from './database.types';
import { migrate } from './migrator';

const logger = new Logger('database');

@Global()
@Module({
  providers: [
    {
      provide: Kysely,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        createDatabase(config.get('DATABASE_URL'), config.get('DATABASE_POOL_MAX')),
    },
  ],
  exports: [Kysely],
})
export class DatabaseModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(private readonly db: Kysely<Database>) {}

  /** Single small instance on the Raspberry Pi: migrating at boot keeps deployment one step. */
  async onApplicationBootstrap(): Promise<void> {
    const applied = await migrate(this.db, MIGRATIONS_DIR);
    logger.log(applied.length ? `applied migrations: ${applied.join(', ')}` : 'schema up to date');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
