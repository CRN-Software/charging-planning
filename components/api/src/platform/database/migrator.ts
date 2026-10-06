import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql, type Kysely } from 'kysely';
import type { Database } from './database.types';

const LOCK_KEY = 'charging_schema_migration';

/** Raw SQL files applied in lexical order, one transaction each; safe across instances (advisory lock). */
export async function migrate(db: Kysely<Database>, dir: string): Promise<string[]> {
  await sql`create table if not exists schema_migration (
    name text primary key,
    applied_at timestamptz not null default now()
  )`.execute(db);
  await sql`select pg_advisory_lock(hashtext(${LOCK_KEY}))`.execute(db);
  try {
    const applied = new Set(
      (await db.selectFrom('schema_migration').select('name').execute()).map((r) => r.name),
    );
    const pending = (await readdir(dir))
      .filter((f) => f.endsWith('.sql') && !applied.has(f))
      .sort();
    for (const name of pending) {
      const body = await readFile(join(dir, name), 'utf8');
      await db.transaction().execute(async (trx) => {
        await sql.raw(body).execute(trx);
        await trx.insertInto('schema_migration').values({ name }).execute();
      });
    }
    return pending;
  } finally {
    await sql`select pg_advisory_unlock(hashtext(${LOCK_KEY}))`.execute(db);
  }
}
