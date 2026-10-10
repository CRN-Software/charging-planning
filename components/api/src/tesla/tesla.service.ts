import { Injectable, Logger } from '@nestjs/common';
import type { VehicleStatus } from '@charging/contracts';
import { GeoService } from '@/places/geo.service';
import { AppConfig } from '@/platform/config/config.module';
import { SecretBox } from '@/platform/crypto/secret-box';
import {
  exchangeCode,
  listVehicles,
  newPendingLink,
  readVehicle,
  refreshTokens,
  wakeUp,
} from './tesla-fleet';
import type { PendingLink, TeslaClient, VehicleSnapshot } from './tesla-fleet';
import { VehicleLinkRepository } from './vehicle-link.repository';
import type { VehicleLink } from './vehicle-link.repository';

export const TESLA_CALLBACK_PATH = '/api/tesla/callback';
/** Vehicle data is billed per call: the car is asked at most this often per household. */
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class TeslaService {
  readonly client: TeslaClient | undefined;
  private readonly logger = new Logger(TeslaService.name);
  /** One check at a time per household: refresh tokens are single use. */
  private readonly checks = new Map<string, Promise<VehicleStatus>>();

  constructor(
    config: AppConfig,
    private readonly box: SecretBox,
    private readonly links: VehicleLinkRepository,
    private readonly geo: GeoService,
  ) {
    const clientId = config.get('TESLA_CLIENT_ID', { infer: true });
    const clientSecret = config.get('TESLA_CLIENT_SECRET', { infer: true });
    this.client =
      clientId && clientSecret
        ? {
            clientId,
            clientSecret,
            redirectUri: `${config.get('PUBLIC_BASE_URL', { infer: true })}${TESLA_CALLBACK_PATH}`,
            audience: config.get('TESLA_AUDIENCE', { infer: true }),
          }
        : undefined;
  }

  startLink(): { pending: PendingLink; cookie: string } {
    const pending = newPendingLink();
    return { pending, cookie: this.box.seal(JSON.stringify(pending)).toString('base64url') };
  }

  readPending(cookie: string | undefined): PendingLink | undefined {
    if (!cookie) return undefined;
    try {
      return JSON.parse(this.box.open(Buffer.from(cookie, 'base64url'))) as PendingLink;
    } catch {
      return undefined;
    }
  }

  async completeLink(
    householdId: string,
    accountId: string,
    code: string,
    pending: PendingLink,
  ): Promise<void> {
    const client = this.required();
    const tokens = await exchangeCode(client, code, pending.verifier);
    const [vehicle] = await listVehicles(client, tokens.access_token);
    const sealed = this.box.seal(tokens.refresh_token);
    await this.links.link(
      householdId,
      accountId,
      sealed,
      vehicle?.vin ?? null,
      vehicle?.display_name ?? null,
    );
  }

  async unlink(householdId: string): Promise<void> {
    await this.links.unlink(householdId);
  }

  /**
   * The last known state of the car, asked again when the previous check is old enough; `wake`
   * (an explicit request of the household) asks now and wakes a sleeping car.
   */
  async status(householdId: string, now: Date, wake = false): Promise<VehicleStatus> {
    const link = await this.links.get(householdId);
    if (!this.client || !link) return this.view(link);
    const fresh = link.checkedAt && now.getTime() - link.checkedAt.getTime() < CHECK_INTERVAL_MS;
    if (fresh && !wake) return this.view(link);
    const running = this.checks.get(householdId) ?? this.check(householdId, link, now, wake);
    this.checks.set(householdId, running);
    return running.finally(() => this.checks.delete(householdId));
  }

  private async check(
    householdId: string,
    link: VehicleLink,
    now: Date,
    wake: boolean,
  ): Promise<VehicleStatus> {
    const client = this.required();
    try {
      const tokens = await refreshTokens(client, this.box.open(link.refreshToken));
      await this.links.rotate(householdId, this.box.seal(tokens.refresh_token));
      const vehicles = await listVehicles(client, tokens.access_token);
      const found = vehicles.find((v) => v.vin === link.vin) ?? vehicles[0];
      const vehicle = found && wake ? await wakeUp(client, tokens.access_token, found) : found;
      const read = vehicle && (await readVehicle(client, tokens.access_token, vehicle));
      const snapshot = read && (await this.located(read));
      await this.links.checked(householdId, now, snapshot);
      return this.view({
        ...link,
        snapshot: snapshot ?? link.snapshot,
        asleep: !snapshot,
        broken: false,
      });
    } catch (error) {
      this.logger.warn({ householdId, error: String(error) }, 'tesla check failed');
      await this.links.checked(householdId, now, undefined, true);
      return this.view({ ...link, broken: true });
    }
  }

  private async located(snapshot: VehicleSnapshot): Promise<VehicleSnapshot> {
    if (snapshot.lat === null || snapshot.lon === null) return snapshot;
    const address = await this.geo.address({ lat: snapshot.lat, lon: snapshot.lon });
    return { ...snapshot, address: address ?? null };
  }

  private view(link: VehicleLink | undefined): VehicleStatus {
    return {
      available: this.client !== undefined,
      linked: link !== undefined,
      name: link?.name ?? null,
      snapshot: link?.snapshot ?? null,
      asleep: link?.asleep ?? false,
      broken: link?.broken ?? false,
    };
  }

  private required(): TeslaClient {
    if (!this.client) throw new Error('Tesla is not configured');
    return this.client;
  }
}
