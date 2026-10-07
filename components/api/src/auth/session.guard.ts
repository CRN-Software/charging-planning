import { createParamDecorator, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from './cookies';
import { SessionsRepository } from './sessions.repository';

type AuthenticatedRequest = FastifyRequest & { accountId?: string };

/** Rejects requests without a valid `sid` cookie; exposes the account through `@CurrentAccount()`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionsRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies[SESSION_COOKIE];
    const accountId = token ? await this.sessions.accountOf(token, new Date()) : undefined;
    if (!accountId) throw new UnauthorizedException();
    request.accountId = accountId;
    return true;
  }
}

export const CurrentAccount = createParamDecorator(
  (_: unknown, context: ExecutionContext): string => {
    const accountId = context.switchToHttp().getRequest<AuthenticatedRequest>().accountId;
    if (!accountId) throw new UnauthorizedException();
    return accountId;
  },
);
