import { z } from 'zod';

/** What the car reported the last time it was awake. */
export const vehicleSnapshotSchema = z.object({
  soc: z.number(),
  limit: z.number(),
  charging: z.string(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  at: z.iso.datetime(),
});

/** The household's link to its Tesla. */
export const vehicleStatusSchema = z.object({
  /** Tesla is configured on this server. */
  available: z.boolean(),
  linked: z.boolean(),
  name: z.string().nullable(),
  snapshot: vehicleSnapshotSchema.nullable(),
  /** The car slept at the last check: the snapshot is older. */
  asleep: z.boolean(),
  /** The link needs to be made again (token revoked or expired). */
  broken: z.boolean(),
});

export type VehicleSnapshot = z.infer<typeof vehicleSnapshotSchema>;
export type VehicleStatus = z.infer<typeof vehicleStatusSchema>;
