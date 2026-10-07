import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import type { Database } from '@/platform/database/database.types';

export const SESSION_DAYS = 30;

export const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();

@Injectable()
export class SessionsRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Returns the token for the cookie; only its hash is stored. */
  async open(accountId: string, now: Date): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 3600 * 1000);
    await this.db.deleteFrom('session').where('expires_at', '<', now).execute();
    await this.db
      .insertInto('session')
      .values({ token_hash: hashToken(token), account_id: accountId, expires_at: expiresAt })
      .execute();
    return token;
  }

  async accountOf(token: string, now: Date): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('session')
      .select('account_id')
      .where('token_hash', '=', hashToken(token))
      .where('expires_at', '>', now)
      .executeTakeFirst();
    return row?.account_id;
  }

  async close(token: string): Promise<void> {
    await this.db.deleteFrom('session').where('token_hash', '=', hashToken(token)).execute();
  }
}
