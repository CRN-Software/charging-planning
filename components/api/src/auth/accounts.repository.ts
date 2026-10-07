import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import type { Database } from '@/platform/database/database.types';
import type { GoogleIdentity } from './google-oauth';

export interface AccountView {
  id: string;
  name: string;
  email: string;
  pictureUrl: string | null;
  household: { id: string; name: string };
  calendarScope: string | null;
}

@Injectable()
export class AccountsRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Creates the account and its own household on first sign-in, refreshes the profile otherwise. */
  async signIn(identity: GoogleIdentity): Promise<string> {
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .updateTable('account')
        .set({
          email: identity.email,
          name: identity.name,
          picture_url: identity.picture ?? null,
          last_login_at: new Date(),
        })
        .where('google_sub', '=', identity.sub)
        .returning('id')
        .executeTakeFirst();
      if (existing) return existing.id;
      const household = await trx
        .insertInto('household')
        .values({ name: `Foyer de ${identity.name || identity.email}` })
        .returning('id')
        .executeTakeFirstOrThrow();
      const account = await trx
        .insertInto('account')
        .values({
          household_id: household.id,
          google_sub: identity.sub,
          email: identity.email,
          name: identity.name,
          picture_url: identity.picture ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return account.id;
    });
  }

  async hasRefreshToken(accountId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('google_credential')
      .select('account_id')
      .where('account_id', '=', accountId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async saveCredential(
    accountId: string,
    sealedRefreshToken: Buffer,
    scope: string,
  ): Promise<void> {
    await this.db
      .insertInto('google_credential')
      .values({ account_id: accountId, refresh_token: sealedRefreshToken, scope })
      .onConflict((oc) =>
        oc
          .column('account_id')
          .doUpdateSet({ refresh_token: sealedRefreshToken, scope, updated_at: new Date() }),
      )
      .execute();
  }

  async sealedRefreshToken(accountId: string): Promise<Buffer | undefined> {
    const row = await this.db
      .selectFrom('google_credential')
      .select('refresh_token')
      .where('account_id', '=', accountId)
      .executeTakeFirst();
    return row?.refresh_token;
  }

  async householdOf(accountId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('account')
      .select('household_id')
      .where('id', '=', accountId)
      .executeTakeFirst();
    return row?.household_id;
  }

  async members(householdId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('account')
      .select('id')
      .where('household_id', '=', householdId)
      .execute();
    return rows.map((row) => row.id);
  }

  async find(accountId: string): Promise<AccountView | undefined> {
    const row = await this.db
      .selectFrom('account')
      .innerJoin('household', 'household.id', 'account.household_id')
      .leftJoin('google_credential', 'google_credential.account_id', 'account.id')
      .select([
        'account.id',
        'account.name',
        'account.email',
        'account.picture_url',
        'household.id as household_id',
        'household.name as household_name',
        'google_credential.scope',
      ])
      .where('account.id', '=', accountId)
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      pictureUrl: row.picture_url,
      household: { id: row.household_id, name: row.household_name },
      calendarScope: row.scope,
    };
  }
}
