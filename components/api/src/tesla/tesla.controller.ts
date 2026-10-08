import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { VehicleStatus } from '@charging/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AccountsRepository } from '@/auth/accounts.repository';
import { cookieOptions } from '@/auth/cookies';
import { CurrentAccount, SessionGuard } from '@/auth/session.guard';
import { AppConfig } from '@/platform/config/config.module';
import { authorizeUrl } from './tesla-fleet';
import { TeslaService } from './tesla.service';

const LINK_COOKIE = 'tesla_link';
const LINK_TTL_SECONDS = 600;
const callbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

@Controller('tesla')
@UseGuards(SessionGuard)
export class TeslaController {
  private readonly baseUrl: string;

  constructor(
    config: AppConfig,
    private readonly tesla: TeslaService,
    private readonly accounts: AccountsRepository,
  ) {
    this.baseUrl = config.get('PUBLIC_BASE_URL');
  }

  @Get('link')
  start(@Res() reply: FastifyReply): void {
    if (!this.tesla.client) return void reply.redirect('/?tesla=indisponible', HttpStatus.FOUND);
    const { pending, cookie } = this.tesla.startLink();
    void reply
      .setCookie(LINK_COOKIE, cookie, cookieOptions(this.baseUrl, LINK_TTL_SECONDS))
      .redirect(authorizeUrl(this.tesla.client, pending), HttpStatus.FOUND);
  }

  @Get('callback')
  async callback(
    @CurrentAccount() accountId: string,
    @Query() raw: unknown,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const query = callbackSchema.parse(raw);
    const pending = this.tesla.readPending(request.cookies[LINK_COOKIE]);
    void reply.clearCookie(LINK_COOKIE, { path: '/' });
    if (!pending || !query.code || query.error || query.state !== pending.state)
      return void reply.redirect('/?tesla=echec', HttpStatus.FOUND);
    const householdId = await this.householdOf(accountId);
    await this.tesla.completeLink(householdId, accountId, query.code, pending);
    void reply.redirect('/?tesla=ok', HttpStatus.FOUND);
  }

  @Get('vehicle')
  async vehicle(@CurrentAccount() accountId: string): Promise<VehicleStatus> {
    return this.tesla.status(await this.householdOf(accountId), new Date());
  }

  @Delete('vehicle')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(@CurrentAccount() accountId: string): Promise<void> {
    await this.tesla.unlink(await this.householdOf(accountId));
  }

  private async householdOf(accountId: string): Promise<string> {
    const household = await this.accounts.householdOf(accountId);
    if (!household) throw new Error('account without household');
    return household;
  }
}
