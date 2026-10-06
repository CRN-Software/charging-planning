import { Global, Logger, Module } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { join } from 'node:path';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import { AppConfig } from '../config/config.module';
import type { Database } from './database.types';
import { migrate } from './migrator';

const logger = new Logger('database');
export const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'migrations');

// `date` columns stay ISO strings: a JS Date would shift the day with the process timezone.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

export const createDatabase = (connectionString: string, max: number): Kysely<Database> => {
  const pool = new Pool({ connectionString, max });
  // Idle connections dropped by the server emit 'error'; unhandled, it kills the process.
  pool.on('error', (error) => {
    logger.warn(`idle connection error: ${error.message}`);
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
};

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
