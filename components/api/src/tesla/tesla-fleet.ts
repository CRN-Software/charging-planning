import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

const AUTHORIZE_URL = 'https://auth.tesla.com/oauth2/v3/authorize';
const TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';
/** Reading only: battery, charge and location. No command scope. */
export const TESLA_SCOPES = ['openid', 'offline_access', 'vehicle_device_data', 'vehicle_location'];
/** Vehicle states in which reading data does not wake the car. */
const AWAKE = 'online';
/** A woken car usually answers within 10 to 30 seconds. */
const WAKE_POLL_MS = 3000;
const WAKE_ATTEMPTS = 15;

export interface TeslaClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Regional Fleet API base URL. */
  audience: string;
}

export interface PendingLink {
  state: string;
  verifier: string;
}

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});
export type TeslaTokens = z.infer<typeof tokenSchema>;

const base64url = (bytes: Buffer): string => bytes.toString('base64url');

export const newPendingLink = (): PendingLink => ({
  state: base64url(randomBytes(24)),
  verifier: base64url(randomBytes(48)),
});

export const authorizeUrl = (client: TeslaClient, pending: PendingLink): string =>
  `${AUTHORIZE_URL}?${new URLSearchParams({
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    scope: TESLA_SCOPES.join(' '),
    state: pending.state,
    code_challenge: base64url(createHash('sha256').update(pending.verifier).digest()),
    code_challenge_method: 'S256',
    prompt_missing_scopes: 'true',
  }).toString()}`;

async function token(body: Record<string, string>): Promise<TeslaTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!response.ok) throw new Error(`Tesla token request failed: HTTP ${response.status}`);
  return tokenSchema.parse(await response.json());
}

export const exchangeCode = (client: TeslaClient, code: string, verifier: string) =>
  token({
    grant_type: 'authorization_code',
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code,
    code_verifier: verifier,
    audience: client.audience,
    redirect_uri: client.redirectUri,
  });

/** Refresh tokens are single use: the new one must be stored before anything else. */
export const refreshTokens = (client: TeslaClient, refreshToken: string) =>
  token({ grant_type: 'refresh_token', client_id: client.clientId, refresh_token: refreshToken });

const vehiclesSchema = z.object({
  response: z.array(
    z.object({ vin: z.string(), display_name: z.string().nullable(), state: z.string() }),
  ),
});
export type TeslaVehicle = z.infer<typeof vehiclesSchema>['response'][number];

const dataSchema = z.object({
  response: z.object({
    charge_state: z.object({
      battery_level: z.number(),
      charge_limit_soc: z.number(),
      charging_state: z.string(),
      timestamp: z.number(),
    }),
    drive_state: z
      .object({ latitude: z.number().nullish(), longitude: z.number().nullish() })
      .optional(),
  }),
});

/** What the car reported the last time it was awake. */
export interface VehicleSnapshot {
  soc: number;
  limit: number;
  charging: string;
  lat: number | null;
  lon: number | null;
  /** The address at that position, when one was found. */
  address?: string | null;
  /** When the car reported it (ISO). */
  at: string;
}

async function fleet(
  client: TeslaClient,
  accessToken: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<Response> {
  return fetch(`${client.audience}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function listVehicles(
  client: TeslaClient,
  accessToken: string,
): Promise<TeslaVehicle[]> {
  const response = await fleet(client, accessToken, '/api/1/vehicles');
  if (!response.ok) throw new Error(`Tesla vehicles failed: HTTP ${response.status}`);
  return vehiclesSchema.parse(await response.json()).response;
}

const vehicleSchema = z.object({ response: z.object({ state: z.string() }) });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wakes the car, only on an explicit request of the household (billed, drains a little
 * battery), and waits until it is online; returns it unchanged if it does not wake up in time.
 */
export async function wakeUp(
  client: TeslaClient,
  accessToken: string,
  vehicle: TeslaVehicle,
  wait: (ms: number) => Promise<unknown> = pause,
): Promise<TeslaVehicle> {
  if (vehicle.state === AWAKE) return vehicle;
  const path = `/api/1/vehicles/${vehicle.vin}`;
  const woken = await fleet(client, accessToken, `${path}/wake_up`, 'POST');
  // A refused wake-up leaves the last reading in place rather than breaking the link.
  if (!woken.ok) return vehicle;
  for (let i = 0; i < WAKE_ATTEMPTS; i++) {
    await wait(WAKE_POLL_MS);
    const response = await fleet(client, accessToken, path);
    if (response.ok && vehicleSchema.parse(await response.json()).response.state === AWAKE)
      return { ...vehicle, state: AWAKE };
  }
  return vehicle;
}

/** Undefined when the car sleeps: it is never woken (no wake_up call, no retry). */
export async function readVehicle(
  client: TeslaClient,
  accessToken: string,
  vehicle: TeslaVehicle,
): Promise<VehicleSnapshot | undefined> {
  if (vehicle.state !== AWAKE) return undefined;
  const response = await fleet(
    client,
    accessToken,
    `/api/1/vehicles/${vehicle.vin}/vehicle_data?endpoints=${encodeURIComponent('charge_state;location_data')}`,
  );
  if (response.status === 408 || response.status === 412) return undefined;
  if (!response.ok) throw new Error(`Tesla vehicle data failed: HTTP ${response.status}`);
  const { charge_state: c, drive_state: d } = dataSchema.parse(await response.json()).response;
  return {
    soc: c.battery_level,
    limit: c.charge_limit_soc,
    charging: c.charging_state,
    lat: d?.latitude ?? null,
    lon: d?.longitude ?? null,
    at: new Date(c.timestamp).toISOString(),
  };
}
