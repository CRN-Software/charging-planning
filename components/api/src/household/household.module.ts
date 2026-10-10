import { Module } from '@nestjs/common';
import { GoogleCalendarClient } from '@/google/google-calendar.client';
import { GeoService } from '@/places/geo.service';
import { EquipmentService } from './equipment.service';
import { HouseholdController } from './household.controller';
import { HouseholdRepository } from './household.repository';
import { HouseholdService } from './household.service';

@Module({
  controllers: [HouseholdController],
  providers: [
    HouseholdRepository,
    HouseholdService,
    EquipmentService,
    GoogleCalendarClient,
    GeoService,
  ],
  exports: [GeoService],
})
export class HouseholdModule {}
