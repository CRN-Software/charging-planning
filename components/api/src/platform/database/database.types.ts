import type { Generated } from 'kysely';

export interface SchemaMigrationTable {
  name: string;
  applied_at: Generated<Date>;
}

export interface HouseholdTable {
  id: Generated<string>;
  name: string;
  /** Validated by householdSettingsSchema (@charging/contracts). */
  settings: Generated<unknown>;
  created_at: Generated<Date>;
}

export interface GeocodeCacheTable {
  query: string;
  lat: number | null;
  lon: number | null;
  label: string | null;
  created_at: Generated<Date>;
}

export interface RouteCacheTable {
  from_lat: number;
  from_lon: number;
  to_lat: number;
  to_lon: number;
  km: number;
  min: number;
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
  geocode_cache: GeocodeCacheTable;
  route_cache: RouteCacheTable;
}
