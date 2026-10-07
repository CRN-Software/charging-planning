import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import { AccountsRepository } from '@/auth/accounts.repository';
import { SessionsRepository } from '@/auth/sessions.repository';
import { createDatabase, MIGRATIONS_DIR } from '@/platform/database/database.factory';
import type { Database } from '@/platform/database/database.types';
import { migrate } from '@/platform/database/migrator';

const DATABASE_URL = process.env.DATABASE_URL;
const NOW = new Date('2026-10-07T12:00:00Z');
const identity = (sub: string) => ({
  iss: 'https://accounts.google.com',
  aud: 'client',
  exp: 0,
  sub,
  email: `${sub}@example.org`,
  email_verified: true,
  name: 'Claire',
});

describe.skipIf(!DATABASE_URL)('accounts and sessions (Postgres)', () => {
  let db: Kysely<Database>;
  let accounts: AccountsRepository;
  let sessions: SessionsRepository;

  beforeAll(async () => {
    db = createDatabase(DATABASE_URL ?? '', 2);
    await migrate(db, MIGRATIONS_DIR);
    accounts = new AccountsRepository(db);
    sessions = new SessionsRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates the household on first sign-in and keeps it afterwards', async () => {
    const sub = `sub-${Date.now()}`;
    const first = await accounts.signIn(identity(sub));
    const second = await accounts.signIn({ ...identity(sub), name: 'Claire D.' });
    const account = await accounts.find(second);
    expect(second).toBe(first);
    expect(account).toMatchObject({ name: 'Claire D.', household: { name: 'Foyer de Claire' }, calendarScope: null });
  });

  it('stores the Google credential once per account', async () => {
    const id = await accounts.signIn(identity(`cred-${Date.now()}`));
    await accounts.saveCredential(id, Buffer.from('sealed-1'), 'openid');
    await accounts.saveCredential(id, Buffer.from('sealed-2'), 'openid calendar');
    expect(await accounts.hasRefreshToken(id)).toBe(true);
    expect((await accounts.find(id))?.calendarScope).toBe('openid calendar');
  });

  it('opens, resolves and closes a session', async () => {
    const id = await accounts.signIn(identity(`session-${Date.now()}`));
    const token = await sessions.open(id, NOW);
    expect(await sessions.accountOf(token, NOW)).toBe(id);
    expect(await sessions.accountOf(token, new Date('2027-01-01'))).toBeUndefined();
    await sessions.close(token);
    expect(await sessions.accountOf(token, NOW)).toBeUndefined();
  });
});
