import { Injectable } from '@nestjs/common';
import { householdSettingsSchema } from '@charging/contracts';
import type { HouseholdSettings } from '@charging/contracts';
import { Kysely } from 'kysely';
import type { Database } from '@/platform/database/database.types';

const EMPTY: HouseholdSettings = { homeAddress: null, home: null, people: [] };

@Injectable()
export class HouseholdRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async settings(householdId: string): Promise<HouseholdSettings> {
    const row = await this.db
      .selectFrom('household')
      .select('settings')
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow();
    const parsed = householdSettingsSchema.safeParse(row.settings);
    return parsed.success ? parsed.data : EMPTY;
  }

  async save(householdId: string, settings: HouseholdSettings): Promise<void> {
    await this.db
      .updateTable('household')
      .set({ settings: JSON.stringify(settings) })
      .where('id', '=', householdId)
      .execute();
  }
}
