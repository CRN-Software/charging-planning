import { describe, expect, it } from 'vitest';
import { validateEnv } from '@/platform/config/env.schema';
import { maskUrl } from '@/platform/logging/pino.options';

const REQUIRED = {
  PUBLIC_BASE_URL: 'http://localhost:5123',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret',
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('environment', () => {
  it('applies defaults on top of the required variables', () => {
    expect(validateEnv(REQUIRED)).toMatchObject({ API_PORT: 6123, APP_VERSION: 'dev', NODE_ENV: 'development' });
  });

  it('refuses a non-postgres database url', () => {
    expect(() => validateEnv({ ...REQUIRED, DATABASE_URL: 'mysql://localhost/db' })).toThrow();
  });

  it('refuses an encryption key that is not 32 bytes', () => {
    expect(() => validateEnv({ ...REQUIRED, TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') })).toThrow();
  });

  it('refuses a missing public url', () => {
    expect(() => validateEnv({ ...REQUIRED, PUBLIC_BASE_URL: undefined })).toThrow();
  });
});

describe('request logs', () => {
  it('keep the route shape only: no query string, no identifiers', () => {
    expect(maskUrl('/api/households/0d6c2a1e-9a51-4b0e-8a0f-3b1d2c4e5f60/plan?token=secret')).toBe('/api/households/:id/plan');
  });
});
