import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
];
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Kept in a sealed cookie between the redirect to Google and the callback. */
export interface PendingLogin {
  state: string;
  verifier: string;
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  id_token: z.string(),
  scope: z.string(),
  refresh_token: z.string().optional(),
});
export type GoogleTokens = z.infer<typeof tokenResponseSchema>;

const claimsSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  exp: z.number(),
  sub: z.string(),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().default(''),
  picture: z.url().optional(),
});
export type GoogleIdentity = z.infer<typeof claimsSchema>;

const base64url = (bytes: Buffer): string => bytes.toString('base64url');

export const newPendingLogin = (): PendingLogin => ({
  state: base64url(randomBytes(24)),
  verifier: base64url(randomBytes(48)),
});

/** Authorization code flow with PKCE; `consent` forces Google to issue a new refresh token. */
export const authorizeUrl = (
  client: GoogleClient,
  pending: PendingLogin,
  consent: boolean,
): string => {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: consent ? 'consent' : 'select_account',
    state: pending.state,
    code_challenge: base64url(createHash('sha256').update(pending.verifier).digest()),
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
};

export const exchangeCode = async (
  client: GoogleClient,
  code: string,
  verifier: string,
): Promise<GoogleTokens> => {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: client.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed: HTTP ${response.status}`);
  return tokenResponseSchema.parse(await response.json());
};

/**
 * The ID token comes straight from Google's token endpoint over TLS, so its signature check is
 * optional (OpenID Connect Core §3.1.3.7); issuer, audience, expiry and e-mail are still checked.
 */
export const identityFromIdToken = (
  idToken: string,
  clientId: string,
  now: Date,
): GoogleIdentity => {
  const payload = idToken.split('.')[1];
  if (!payload) throw new Error('malformed ID token');
  const claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  if (!ISSUERS.has(claims.iss)) throw new Error('unexpected ID token issuer');
  if (claims.aud !== clientId) throw new Error('ID token issued for another client');
  if (claims.exp * 1000 <= now.getTime()) throw new Error('expired ID token');
  if (!claims.email_verified) throw new Error('unverified Google e-mail');
  return claims;
};
