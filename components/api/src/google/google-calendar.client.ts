import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AccountsRepository } from '@/auth/accounts.repository';
import { AuthService } from '@/auth/auth.service';
import { refreshAccessToken } from '@/auth/google-oauth';
import { SecretBox } from '@/platform/crypto/secret-box';

const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_MARGIN_MS = 60_000;

const calendarListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().default(''),
        primary: z.boolean().optional(),
      }),
    )
    .default([]),
});

const momentSchema = z.object({ dateTime: z.string().optional(), date: z.string().optional() });
export const googleEventSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  start: momentSchema,
  end: momentSchema,
});
const eventListSchema = z.object({ items: z.array(googleEventSchema).default([]) });

export type GoogleEvent = z.infer<typeof googleEventSchema>;

/** Read-only access to the calendars of an account, through its stored refresh token. */
@Injectable()
export class GoogleCalendarClient {
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly auth: AuthService,
    private readonly accounts: AccountsRepository,
    private readonly box: SecretBox,
  ) {}

  async calendars(accountId: string): Promise<{ id: string; name: string; primary: boolean }[]> {
    const list = calendarListSchema.parse(
      await this.get(accountId, '/users/me/calendarList?minAccessRole=reader'),
    );
    return list.items.map((item) => ({
      id: item.id,
      name: item.summary,
      primary: item.primary ?? false,
    }));
  }

  async events(
    accountId: string,
    calendarId: string,
    from: Date,
    to: Date,
  ): Promise<GoogleEvent[]> {
    const query = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
    });
    const path = `/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`;
    return eventListSchema.parse(await this.get(accountId, path)).items;
  }

  private async get(accountId: string, path: string): Promise<unknown> {
    const response = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${await this.accessToken(accountId)}` },
    });
    if (!response.ok) throw new Error(`Google Calendar: HTTP ${response.status}`);
    return response.json();
  }

  private async accessToken(accountId: string): Promise<string> {
    const cached = this.tokens.get(accountId);
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > Date.now()) return cached.token;
    const sealed = await this.accounts.sealedRefreshToken(accountId);
    if (!sealed) throw new Error('no Google access for this account');
    const fresh = await refreshAccessToken(this.auth.google, this.box.open(sealed));
    this.tokens.set(accountId, fresh);
    return fresh.token;
  }
}
