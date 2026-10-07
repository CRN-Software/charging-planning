import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizeUrl, identityFromIdToken, newPendingLogin } from '@/auth/google-oauth';
import { hashToken } from '@/auth/sessions.repository';
import { SecretBox } from '@/platform/crypto/secret-box';

const CLIENT = { clientId: 'client-id', clientSecret: 'secret', redirectUri: 'https://app.test/api/auth/google/callback' };
const NOW = new Date('2026-10-07T12:00:00Z');

const idToken = (claims: Record<string, unknown>): string =>
  ['header', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'signature'].join('.');

const VALID = {
  iss: 'https://accounts.google.com',
  aud: 'client-id',
  exp: NOW.getTime() / 1000 + 300,
  sub: '1234',
  email: 'paul@example.org',
  email_verified: true,
  name: 'Paul',
};

describe('secret box', () => {
  const box = new SecretBox(Buffer.alloc(32, 1).toString('base64'));

  it('opens what it sealed', () => {
    expect(box.open(box.seal('refresh-token'))).toBe('refresh-token');
  });

  it('refuses an altered payload', () => {
    const sealed = box.seal('refresh-token');
    sealed[sealed.length - 1] = (sealed[sealed.length - 1] ?? 0) ^ 1;
    expect(() => box.open(sealed)).toThrow();
  });

  it('refuses a key of the wrong size', () => {
    expect(() => new SecretBox(Buffer.alloc(16).toString('base64'))).toThrow();
  });
});

describe('Google authorization request', () => {
  it('asks for offline calendar access with PKCE and state', () => {
    const pending = newPendingLogin();
    const url = new URL(authorizeUrl(CLIENT, pending, false));
    const challenge = createHash('sha256').update(pending.verifier).digest('base64url');
    expect(url.searchParams.get('scope')).toContain('calendar.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe(pending.state);
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  it('forces the consent screen when a refresh token is needed', () => {
    expect(new URL(authorizeUrl(CLIENT, newPendingLogin(), true)).searchParams.get('prompt')).toBe('consent');
  });
});

describe('Google identity', () => {
  it('reads a valid ID token', () => {
    expect(identityFromIdToken(idToken(VALID), 'client-id', NOW)).toMatchObject({ sub: '1234', email: 'paul@example.org' });
  });

  it.each([
    ['another audience', { aud: 'other' }],
    ['another issuer', { iss: 'https://evil.example' }],
    ['an expired token', { exp: NOW.getTime() / 1000 - 1 }],
    ['an unverified e-mail', { email_verified: false }],
  ])('refuses %s', (_, override) => {
    expect(() => identityFromIdToken(idToken({ ...VALID, ...override }), 'client-id', NOW)).toThrow();
  });
});

describe('sessions', () => {
  it('store a hash, never the token', () => {
    expect(hashToken('token')).toEqual(createHash('sha256').update('token').digest());
    expect(hashToken('token').toString('utf8')).not.toContain('token');
  });
});
