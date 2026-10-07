import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import type { Me } from '@charging/contracts';
import { AccountsRepository } from '@/auth/accounts.repository';
import { CALENDAR_SCOPE } from '@/auth/google-oauth';
import { CurrentAccount, SessionGuard } from '@/auth/session.guard';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly accounts: AccountsRepository) {}

  @Get()
  async me(@CurrentAccount() accountId: string): Promise<Me> {
    const account = await this.accounts.find(accountId);
    if (!account) throw new NotFoundException();
    const { calendarScope, ...profile } = account;
    return {
      ...profile,
      calendarAccess: calendarScope?.split(' ').includes(CALENDAR_SCOPE) ?? false,
    };
  }
}
