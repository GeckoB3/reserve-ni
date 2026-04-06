import { z } from 'zod';

const periodSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});

export const venueOpeningExceptionSchema = z
  .object({
    id: z.string().min(1).max(80),
    date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    closed: z.boolean(),
    periods: z.array(periodSchema).max(4).optional(),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict()
  .refine((row) => row.date_end >= row.date_start, { message: 'date_end must be on or after date_start' })
  .refine(
    (row) => {
      if (row.closed) return true;
      return (row.periods?.length ?? 0) > 0;
    },
    { message: 'Amended hours require at least one open period' },
  );

export const venueOpeningExceptionsPayloadSchema = z.object({
  exceptions: z.array(venueOpeningExceptionSchema).max(200),
});

export type VenueOpeningException = z.infer<typeof venueOpeningExceptionSchema>;

export function parseVenueOpeningExceptions(raw: unknown): VenueOpeningException[] {
  if (!Array.isArray(raw)) return [];
  const out: VenueOpeningException[] = [];
  for (const item of raw) {
    const p = venueOpeningExceptionSchema.safeParse(item);
    if (p.success) out.push(p.data);
  }
  return out;
}
