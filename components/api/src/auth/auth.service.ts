import { Injectable } from '@nestjs/common';
import { AppConfig } from '@/platform/config/config.module';
import { SecretBox } from '@/platform/crypto/secret-box';
import { AccountsRepository } from './accounts.repository';
import { exchangeCode, identityFromIdToken, newPendingLogin } from './google-oauth';
import type { GoogleClient, PendingLogin } from './google-oauth';
import { SessionsRepository } from './sessions.repository';

export const CALLBACK_PATH = '/api/auth/google/callback';

/** A session token, or the need to ask Google again with consent (no refresh token yet). */
export type LoginOutcome = { session: string } | { needsConsent: true };

@Injectable()
export class AuthService {
  readonly google: GoogleClient;

  constructor(
    config: AppConfig,
    private readonly box: SecretBox,
    private readonly accounts: AccountsRepository,
    private readonly sessions: SessionsRepository,
  ) {
    this.google = {
      clientId: config.get('GOOGLE_CLIENT_ID'),
      clientSecret: config.get('GOOGLE_CLIENT_SECRET'),
      redirectUri: `${config.get('PUBLIC_BASE_URL')}${CALLBACK_PATH}`,
    };
  }

  startLogin(): { pending: PendingLogin; cookie: string } {
    const pending = newPendingLogin();
    return { pending, cookie: this.box.seal(JSON.stringify(pending)).toString('base64url') };
  }

  /** Undefined when the cookie is missing, expired or forged. */
  readPending(cookie: string | undefined): PendingLogin | undefined {
    if (!cookie) return undefined;
    try {
      return JSON.parse(this.box.open(Buffer.from(cookie, 'base64url'))) as PendingLogin;
    } catch {
      return undefined;
    }
  }

  async completeLogin(code: string, pending: PendingLogin, now: Date): Promise<LoginOutcome> {
    const tokens = await exchangeCode(this.google, code, pending.verifier);
    const identity = identityFromIdToken(tokens.id_token, this.google.clientId, now);
    const accountId = await this.accounts.signIn(identity);
    if (tokens.refresh_token) {
      await this.accounts.saveCredential(
        accountId,
        this.box.seal(tokens.refresh_token),
        tokens.scope,
      );
    } else if (!(await this.accounts.hasRefreshToken(accountId))) {
      return { needsConsent: true };
    }
    return { session: await this.sessions.open(accountId, now) };
  }

  async logout(session: string | undefined): Promise<void> {
    if (session) await this.sessions.close(session);
  }
}
