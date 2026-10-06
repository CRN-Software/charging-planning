import { z } from 'zod';

export const healthSchema = z.object({
  status: z.literal('ok'),
  db: z.literal('up'),
  version: z.string(),
});

export type Health = z.infer<typeof healthSchema>;
