import type { CookieSerializeOptions } from '@fastify/cookie';

export const SESSION_COOKIE = 'sid';
export const LOGIN_COOKIE = 'oauth_login';

/** httpOnly, same-site lax (the OAuth callback is a top-level navigation), secure behind HTTPS. */
export const cookieOptions = (
  publicBaseUrl: string,
  maxAgeSeconds: number,
): CookieSerializeOptions => ({
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: publicBaseUrl.startsWith('https://'),
  maxAge: maxAgeSeconds,
});
