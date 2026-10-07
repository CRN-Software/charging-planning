import { Body, Controller, Get, NotFoundException, Put, UseGuards } from '@nestjs/common';
import { householdSetupSchema } from '@charging/contracts';
import type { Agenda, Calendar, HouseholdSettings } from '@charging/contracts';
import { AccountsRepository } from '@/auth/accounts.repository';
import { CurrentAccount, SessionGuard } from '@/auth/session.guard';
import { HouseholdRepository } from './household.repository';
import { HouseholdService } from './household.service';

@Controller('household')
@UseGuards(SessionGuard)
export class HouseholdController {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly households: HouseholdRepository,
    private readonly service: HouseholdService,
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
