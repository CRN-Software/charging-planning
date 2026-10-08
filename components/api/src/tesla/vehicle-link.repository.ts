import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import type { Database } from '@/platform/database/database.types';
import type { VehicleSnapshot } from './tesla-fleet';

export interface VehicleLink {
  refreshToken: Buffer;
  vin: string | null;
  name: string | null;
  snapshot: VehicleSnapshot | null;
  checkedAt: Date | null;
  asleep: boolean;
  broken: boolean;
}

@Injectable()
export class VehicleLinkRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async get(householdId: string): Promise<VehicleLink | undefined> {
    const row = await this.db
      .selectFrom('vehicle_link')
      .selectAll()
      .where('household_id', '=', householdId)
      .executeTakeFirst();
    return (
      row && {
        refreshToken: row.refresh_token,
        vin: row.vin,
        name: row.display_name,
        snapshot: row.snapshot as VehicleSnapshot | null,
        checkedAt: row.checked_at,
        asleep: row.asleep,
        broken: row.broken,
      }
    );
  }

  async link(
    householdId: string,
    accountId: string,
    refreshToken: Buffer,
    vin: string | null,
    name: string | null,
  ) {
    const values = {
      linked_by: accountId,
      refresh_token: refreshToken,
      vin,
      display_name: name,
      snapshot: null,
      checked_at: null,
      asleep: false,
      broken: false,
      updated_at: new Date(),
    };
    await this.db
      .insertInto('vehicle_link')
      .values({ household_id: householdId, ...values })
      .onConflict((c) => c.column('household_id').doUpdateSet(values))
      .execute();
  }

  async rotate(householdId: string, refreshToken: Buffer): Promise<void> {
    await this.db
      .updateTable('vehicle_link')
      .set({ refresh_token: refreshToken, updated_at: new Date() })
      .where('household_id', '=', householdId)
      .execute();
  }

  /** A check of the car; the snapshot is kept when the car slept. */
  async checked(
    householdId: string,
    at: Date,
    snapshot: VehicleSnapshot | undefined,
    broken = false,
  ): Promise<void> {
    await this.db
      .updateTable('vehicle_link')
      .set({
        checked_at: at,
        asleep: !snapshot && !broken,
        broken,
        ...(snapshot && { snapshot: JSON.stringify(snapshot) }),
      })
      .where('household_id', '=', householdId)
      .execute();
  }

  async unlink(householdId: string): Promise<void> {
    await this.db.deleteFrom('vehicle_link').where('household_id', '=', householdId).execute();
  }
}
