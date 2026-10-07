import type { Generated } from 'kysely';

export interface SchemaMigrationTable {
  name: string;
  applied_at: Generated<Date>;
}

export interface HouseholdTable {
  id: Generated<string>;
  name: string;
  created_at: Generated<Date>;
}

export interface AccountTable {
  id: Generated<string>;
  household_id: string;
  google_sub: string;
  email: string;
  name: string;
  picture_url: string | null;
  created_at: Generated<Date>;
  last_login_at: Generated<Date>;
}

export interface GoogleCredentialTable {
  account_id: string;
  refresh_token: Buffer;
  scope: string;
  updated_at: Generated<Date>;
}

export interface SessionTable {
  token_hash: Buffer;
  account_id: string;
  expires_at: Date;
  created_at: Generated<Date>;
}

/** Kysely schema; each module adds its tables here as migrations introduce them. */
export interface Database {
  schema_migration: SchemaMigrationTable;
  household: HouseholdTable;
  account: AccountTable;
  google_credential: GoogleCredentialTable;
  session: SessionTable;
}
