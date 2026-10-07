import { Module } from '@nestjs/common';
import { GoogleCalendarClient } from '@/google/google-calendar.client';
import { GeoService } from '@/places/geo.service';
import { HouseholdController } from './household.controller';
import { HouseholdRepository } from './household.repository';
import { HouseholdService } from './household.service';

@Module({
  controllers: [HouseholdController],
  providers: [HouseholdRepository, HouseholdService, GoogleCalendarClient, GeoService],
})
export class HouseholdModule {}
