import { Injectable } from '@nestjs/common';
import type { HouseholdSettings } from '@charging/contracts';
import { Kysely } from 'kysely';
import type { Database } from '@/platform/database/database.types';
import { readSettings } from './settings-reader';

@Injectable()
export class HouseholdRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async settings(householdId: string): Promise<HouseholdSettings> {
    const row = await this.db
      .selectFrom('household')
      .select('settings')
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow();
    return readSettings(row.settings);
  }

  async save(householdId: string, settings: HouseholdSettings): Promise<void> {
    await this.db
      .updateTable('household')
      .set({ settings: JSON.stringify(settings) })
      .where('id', '=', householdId)
      .execute();
  }
}
