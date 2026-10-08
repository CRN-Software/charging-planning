import { BadRequestException, Injectable } from '@nestjs/common';
import type { Equipment, HouseholdSettings, StoredCharger } from '@charging/contracts';
import { GeoService } from '@/places/geo.service';
import { HouseholdRepository } from './household.repository';

/** Vehicles, chargers and reserve: checked against the household, chargers geocoded. */
@Injectable()
export class EquipmentService {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly geo: GeoService,
  ) {}

  async save(householdId: string, equipment: Equipment): Promise<HouseholdSettings> {
    const current = await this.households.settings(householdId);
    const tracked = equipment.vehicles.find((v) => v.id === equipment.trackedVehicle);
    if (!tracked?.electric || !tracked.batteryKwh || !tracked.whPerKm)
      throw new BadRequestException(
        'the tracked vehicle must be electric, with battery and consumption',
      );
    const people = new Set(current.people.map((p) => p.id));
    if (equipment.chargers.some((c) => c.workplace && !people.has(c.workplace.person)))
      throw new BadRequestException('workplace of an unknown person');
    const chargers = await Promise.all(equipment.chargers.map((c) => this.locate(c, current)));
    const settings = { ...current, equipment: { ...equipment, chargers } };
    await this.households.save(householdId, settings);
    return settings;
  }

  /** Coordinates of a charger's address; reused while the address does not change. */
  private async locate(
    charger: Equipment['chargers'][number],
    current: HouseholdSettings,
  ): Promise<StoredCharger> {
    const known = current.equipment.chargers.find((c) => c.address === charger.address);
    if (known) return { ...charger, lat: known.lat, lon: known.lon };
    const found = await this.geo.geocode(charger.address);
    if (!found) throw new BadRequestException(`charger address not found: ${charger.label}`);
    return { ...charger, lat: found.lat, lon: found.lon };
  }
}
