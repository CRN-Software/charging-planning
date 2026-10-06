import type { Options } from 'pino-http';
import type { Env } from '@/platform/config/env.schema';

const NEST_TO_PINO: Record<Env['LOG_LEVEL'], string> = {
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  log: 'info',
  debug: 'debug',
  verbose: 'trace',
};

interface RequestView {
  id: string;
  method: string;
  url: string;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Route shape only: no query string (tokens), no identifiers (capabilities, entity ids). */
export const maskUrl = (url: string): string => url.split('?')[0]?.replaceAll(UUID, ':id') ?? '';

/**
 * Privacy by design: no IP, no user-agent, no cookies, no auth headers, no bodies, no query
 * strings and no identifiers in logs.
 * Request logs carry method, path, status, duration and the request id (Fastify's, or the
 * inbound x-request-id set by the reverse proxy) — nothing else.
 */
export const pinoOptions = (env: Env['NODE_ENV'], level: Env['LOG_LEVEL']): Options => ({
  level: NEST_TO_PINO[level],
  redact: { paths: ['req.headers', 'res.headers'], remove: true },
  serializers: {
    req: ({ id, method, url }: RequestView) => ({ id, method, url: maskUrl(url) }),
    res: ({ statusCode }: { statusCode: number }) => ({ statusCode }),
  },
  autoLogging: { ignore: (req) => req.url === '/api/health' },
  ...(env === 'development'
    ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
    : {}),
});
