import type { Generated } from 'kysely';

export interface SchemaMigrationTable {
  name: string;
  applied_at: Generated<Date>;
}

/** Kysely schema; each module adds its tables here as migrations introduce them. */
export interface Database {
  schema_migration: SchemaMigrationTable;
}
