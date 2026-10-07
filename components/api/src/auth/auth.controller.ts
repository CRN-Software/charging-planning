import { Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppConfig } from '@/platform/config/config.module';
import { AuthService } from './auth.service';
import { cookieOptions, LOGIN_COOKIE, SESSION_COOKIE } from './cookies';
import { authorizeUrl } from './google-oauth';
import { SESSION_DAYS } from './sessions.repository';

const LOGIN_TTL_SECONDS = 600;
const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

@Controller('auth')
export class AuthController {
  private readonly baseUrl: string;

  constructor(
    config: AppConfig,
    private readonly auth: AuthService,
  ) {
    this.baseUrl = config.get('PUBLIC_BASE_URL');
  }

  @Get('google')
  start(@Query('consent') consent: string | undefined, @Res() reply: FastifyReply): void {
    const { pending, cookie } = this.auth.startLogin();
    void reply
      .setCookie(LOGIN_COOKIE, cookie, cookieOptions(this.baseUrl, LOGIN_TTL_SECONDS))
      .redirect(authorizeUrl(this.auth.google, pending, consent === '1'), HttpStatus.FOUND);
  }

  @Get('google/callback')
  async callback(
    @Query() raw: unknown,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const query = callbackQuerySchema.parse(raw);
    const pending = this.auth.readPending(request.cookies[LOGIN_COOKIE]);
    void reply.clearCookie(LOGIN_COOKIE, { path: '/' });
    if (!pending || !query.code || query.error || query.state !== pending.state) {
      return void reply.redirect('/?connexion=echec', HttpStatus.FOUND);
    }
    const outcome = await this.auth.completeLogin(query.code, pending, new Date());
    if ('needsConsent' in outcome)
      return void reply.redirect('/api/auth/google?consent=1', HttpStatus.FOUND);
    void reply
      .setCookie(
        SESSION_COOKIE,
        outcome.session,
        cookieOptions(this.baseUrl, SESSION_DAYS * 24 * 3600),
      )
      .redirect('/', HttpStatus.FOUND);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(request.cookies[SESSION_COOKIE]);
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
