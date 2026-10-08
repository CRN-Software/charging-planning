import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeUrl, newPendingLink, readVehicle, TESLA_SCOPES } from '@/tesla/tesla-fleet';
import type { TeslaClient } from '@/tesla/tesla-fleet';

const CLIENT: TeslaClient = {
  clientId: 'client',
  clientSecret: 'secret',
  redirectUri: 'https://example.test/api/tesla/callback',
  audience: 'https://fleet-api.prd.eu.vn.cloud.tesla.com',
};
const VEHICLE = { vin: 'VIN0', display_name: 'Ma voiture', state: 'online' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tesla link', () => {
  it('asks for reading scopes only, with PKCE', () => {
    const url = new URL(authorizeUrl(CLIENT, newPendingLink()));
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(TESLA_SCOPES);
    expect(TESLA_SCOPES.some((s) => s.includes('cmds'))).toBe(false);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(CLIENT.redirectUri);
  });
});

describe('tesla vehicle data', () => {
  it('never asks a sleeping car', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await readVehicle(CLIENT, 'token', { ...VEHICLE, state: 'asleep' })).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads battery, limit and location from an awake car', async () => {
    const body = {
      response: {
        charge_state: { battery_level: 57, charge_limit_soc: 80, charging_state: 'Stopped', timestamp: Date.UTC(2026, 9, 8, 8) },
        drive_state: { latitude: 50.6, longitude: 3.1 },
      },
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal('fetch', fetch);
    expect(await readVehicle(CLIENT, 'token', VEHICLE)).toEqual({
      soc: 57,
      limit: 80,
      charging: 'Stopped',
      lat: 50.6,
      lon: 3.1,
      at: '2026-10-08T08:00:00.000Z',
    });
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/api/1/vehicles/VIN0/vehicle_data?endpoints=charge_state%3Blocation_data');
  });

  it('treats a car falling asleep meanwhile as asleep', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 408 })));
    expect(await readVehicle(CLIENT, 'token', VEHICLE)).toBeUndefined();
  });
});
