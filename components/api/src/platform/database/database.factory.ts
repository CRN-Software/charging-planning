import { Logger } from '@nestjs/common';
import { join } from 'node:path';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import type { Database } from './database.types';

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
