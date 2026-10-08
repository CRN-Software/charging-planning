import { Injectable } from '@nestjs/common';
import { EMPTY_PLANNING, planningSchema } from '@charging/contracts';
import type { HouseholdSettings, Planning } from '@charging/contracts';
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

  async planning(householdId: string): Promise<Planning> {
    const row = await this.db
      .selectFrom('household')
      .select('planning')
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow();
    const parsed = planningSchema.safeParse(row.planning);
    return parsed.success ? parsed.data : EMPTY_PLANNING;
  }

  async savePlanning(householdId: string, planning: Planning): Promise<void> {
    await this.db
      .updateTable('household')
      .set({ planning: JSON.stringify(planning) })
      .where('id', '=', householdId)
      .execute();
  }

  async save(householdId: string, settings: HouseholdSettings): Promise<void> {
    await this.db
      .updateTable('household')
      .set({ settings: JSON.stringify(settings) })
      .where('id', '=', householdId)
      .execute();
  }
}
