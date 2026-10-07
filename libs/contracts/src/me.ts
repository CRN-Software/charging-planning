import { z } from 'zod';

export const meSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  pictureUrl: z.url().nullable(),
  household: z.object({ id: z.uuid(), name: z.string() }),
  /** False when the person unticked calendar access on Google's consent screen. */
  calendarAccess: z.boolean(),
});

export type Me = z.infer<typeof meSchema>;
