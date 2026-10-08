import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(6123),
  APP_VERSION: z.string().default('dev'),
  PUBLIC_BASE_URL: z.url(),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'log', 'debug', 'verbose']).default('log'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  /** Tesla Fleet API (optional: without it, the battery is read by hand). */
  TESLA_CLIENT_ID: z.string().min(1).optional(),
  TESLA_CLIENT_SECRET: z.string().min(1).optional(),
  TESLA_AUDIENCE: z.url().default('https://fleet-api.prd.eu.vn.cloud.tesla.com'),
  /** 32 random bytes, base64: seals third-party tokens at rest and the OAuth cookie. */
  TOKEN_ENCRYPTION_KEY: z
    .base64()
    .refine((key) => Buffer.from(key, 'base64').length === 32, '32 bytes expected'),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (raw: Record<string, unknown>): Env => envSchema.parse(raw);
