import { Body, Controller, Get, NotFoundException, Put, UseGuards } from '@nestjs/common';
import { equipmentSchema, householdSetupSchema, planningSchema } from '@charging/contracts';
import type { Agenda, Calendar, HouseholdSettings, Planning } from '@charging/contracts';
import { AccountsRepository } from '@/auth/accounts.repository';
import { CurrentAccount, SessionGuard } from '@/auth/session.guard';
import { EquipmentService } from './equipment.service';
import { HouseholdRepository } from './household.repository';
import { HouseholdService } from './household.service';

@Controller('household')
@UseGuards(SessionGuard)
export class HouseholdController {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly households: HouseholdRepository,
    private readonly service: HouseholdService,
    private readonly equipment: EquipmentService,
  ) {}

  @Get()
  async settings(@CurrentAccount() accountId: string): Promise<HouseholdSettings> {
    return this.households.settings(await this.householdOf(accountId));
  }

  @Put()
  async setup(
    @CurrentAccount() accountId: string,
    @Body() body: unknown,
  ): Promise<HouseholdSettings> {
    return this.service.setup(await this.householdOf(accountId), householdSetupSchema.parse(body));
  }

  @Put('equipment')
  async saveEquipment(
    @CurrentAccount() accountId: string,
    @Body() body: unknown,
  ): Promise<HouseholdSettings> {
    return this.equipment.save(await this.householdOf(accountId), equipmentSchema.parse(body));
  }

  @Get('planning')
  async planning(@CurrentAccount() accountId: string): Promise<Planning> {
    return this.households.planning(await this.householdOf(accountId));
  }

  @Put('planning')
  async savePlanning(
    @CurrentAccount() accountId: string,
    @Body() body: unknown,
  ): Promise<Planning> {
    const planning = planningSchema.parse(body);
    await this.households.savePlanning(await this.householdOf(accountId), planning);
    return planning;
  }

  @Get('calendars')
  async calendars(@CurrentAccount() accountId: string): Promise<Calendar[]> {
    return this.service.calendars(await this.householdOf(accountId));
  }

  @Get('agenda')
  async agenda(@CurrentAccount() accountId: string): Promise<Agenda> {
    return this.service.agenda(await this.householdOf(accountId), new Date());
  }

  private async householdOf(accountId: string): Promise<string> {
    const householdId = await this.accounts.householdOf(accountId);
    if (!householdId) throw new NotFoundException();
    return householdId;
  }
}
