/** Zod schemas shared by the Linked Accounts API routes. */

import { z } from 'zod';

export const grantSchema = z.object({
  calendar: z.enum(['none', 'time_only', 'full_details']),
  pii: z.boolean(),
  act: z.enum(['none', 'edit_existing', 'create_edit_cancel']),
  /** §18 calendar scope: practitioner/calendar ids this direction is limited to. null/omitted = all. */
  calendarIds: z.array(z.string().uuid()).max(200).nullable().optional(),
});

export const grantPairSchema = z.object({
  /** What my venue exposes to the other venue. */
  mine: grantSchema,
  /** What the other venue exposes to my venue. */
  theirs: grantSchema,
});

export const createLinkSchema = z.object({
  targetSlug: z.string().min(1).max(120),
  requestMessage: z.string().max(1000).optional(),
  grants: grantPairSchema,
});

export const respondLinkSchema = z.object({
  action: z.enum([
    'accept',
    'accept_with_changes',
    'reject',
    'cancel',
    'propose_change',
    'accept_change',
    'reject_change',
    'cancel_change',
  ]),
  grants: grantPairSchema.optional(),
});

export const reduceLinkSchema = z.object({
  /** New (reduced) grant my venue exposes to the other venue. */
  grant: grantSchema,
});

export type GrantInput = z.infer<typeof grantSchema>;
export type GrantPairInput = z.infer<typeof grantPairSchema>;

// ---- Cross-venue booking mutation ------------------------------------------

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

export const linkedBookingChangeSchema = z.object({
  bookingId: z.string().uuid(),
  changes: z
    .object({
      booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      booking_time: z.string().regex(TIME_RE).optional(),
      booking_end_time: z.string().regex(TIME_RE).optional(),
      practitioner_id: z.string().uuid().nullable().optional(),
      appointment_service_id: z.string().uuid().nullable().optional(),
      status: z
        .enum(['Pending', 'Booked', 'Confirmed', 'Cancelled', 'No-Show', 'Completed', 'Seated'])
        .optional(),
      special_requests: z.string().max(2000).nullable().optional(),
      dietary_notes: z.string().max(2000).nullable().optional(),
    })
    .refine((c) => Object.keys(c).length > 0, { message: 'No changes supplied.' }),
});

export const linkedBookingCreateSchema = z.object({
  ownerVenueId: z.string().uuid(),
  guestId: z.string().uuid(),
  practitionerId: z.string().uuid().nullable().optional(),
  appointmentServiceId: z.string().uuid().nullable().optional(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingTime: z.string().regex(TIME_RE),
  bookingEndTime: z.string().regex(TIME_RE).optional(),
  partySize: z.number().int().min(1).max(99).optional(),
  specialRequests: z.string().max(2000).optional(),
});

// ---- Venue collectives (Phase 2) -------------------------------------------

export const collectiveSlugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.');

export const collectiveBrandingSchema = z.object({
  logo_url: z.string().url().max(500).nullable().optional(),
  primary_colour: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  description: z.string().max(600).nullable().optional(),
});

export const createCollectiveSchema = z.object({
  name: z.string().min(2).max(120),
  slug: collectiveSlugSchema,
  branding: collectiveBrandingSchema.optional(),
  serviceGrouping: z.enum(['by_practitioner', 'by_service_type']).optional(),
  allowAnyPractitioner: z.boolean().optional(),
  inviteVenueIds: z.array(z.string().uuid()).min(1).max(20),
});

const hexColour = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .nullable()
  .optional();

/** Single-venue-grade public-page config for the combined page (plan §22 / G6). */
export const collectiveBookingPageConfigSchema = z
  .object({
    brand_primary: hexColour,
    brand_accent: hexColour,
    font_preset: z.string().max(40).nullable().optional(),
    about: z.string().max(2000).nullable().optional(),
    announcement: z.string().max(300).nullable().optional(),
    cover_photo_url: z.union([z.literal(''), z.string().url().max(500)]).nullable().optional(),
    cover_full_width: z.boolean().optional(),
    show_services_tab: z.boolean().optional(),
    show_team_tab: z.boolean().optional(),
    show_about_tab: z.boolean().optional(),
    /** Host overrides over inherited staff bios, keyed by calendar id (D-V2). */
    team_profiles: z
      .record(
        z.string().uuid(),
        z.object({
          bio: z.string().max(600).nullable().optional(),
          specialties: z.string().max(200).nullable().optional(),
          hidden: z.boolean().optional(),
        }),
      )
      .optional(),
  })
  .strip();

export const updateCollectiveSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  branding: collectiveBrandingSchema.optional(),
  serviceGrouping: z.enum(['by_practitioner', 'by_service_type']).optional(),
  allowAnyPractitioner: z.boolean().optional(),
  /** Combined booking page address (plan D1). */
  slugStrategy: z.enum(['dedicated', 'adopt_member']).optional(),
  /** Required when slugStrategy = 'adopt_member': the member venue whose /book/{slug} hosts the page. */
  adoptedVenueId: z.string().uuid().nullable().optional(),
  /** Single-venue-grade page customisation (plan §22 / G6). */
  bookingPageConfig: collectiveBookingPageConfigSchema.optional(),
});

export const collectiveMemberActionSchema = z.object({
  action: z.enum([
    'invite',
    'accept',
    'decline',
    'leave',
    'remove',
    'configure',
    'transfer_host',
  ]),
  /** invite / remove: the venue being invited or removed. */
  venueId: z.string().uuid().optional(),
  /** configure / accept: member display settings. */
  visiblePractitionerIds: z.array(z.string().uuid()).optional(),
  visibleServiceIds: z.array(z.string().uuid()).optional(),
  allowAnyPractitionerSubstitution: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
  /** configure: what this member's own /book/{slug} does while the combined page is live (plan D2). */
  soloPageBehavior: z.enum(['keep_live', 'redirect']).optional(),
});

// ---- Combined-page catalogue (plan §4.3/§4.4, §7.3/§7.4) --------------------

/** Sensible pence ceiling shared by item defaults and per-provider overrides. */
const PRICE_PENCE_MAX = 1_000_000; // £10,000

export const catalogueActionSchema = z.object({
  action: z.enum([
    // Host (structure):
    'create_item',
    'update_item',
    'archive_item',
    'add_provider',
    'update_provider',
    'remove_provider',
    // Member (consent over its own calendars, plan D6):
    'approve_provider',
    'reject_provider',
    'set_provider_terms',
  ]),
  // Item fields.
  itemId: z.string().uuid().optional(),
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(120).nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  defaultDurationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  defaultPricePence: z.number().int().min(0).max(PRICE_PENCE_MAX).nullable().optional(),
  pricingDisplay: z.enum(['from', 'fixed', 'per_provider']).optional(),
  allowAnyAvailable: z.boolean().optional(),
  /** Per-offering photo for the Services tab (plan §22 / G6). */
  imageUrl: z.union([z.literal(''), z.string().url().max(500)]).nullable().optional(),
  /** Used by create_item to seed providers from a set of source services in one call. */
  sourceServiceIds: z
    .array(z.object({ venueId: z.string().uuid(), sourceServiceId: z.string().uuid() }))
    .max(50)
    .optional(),
  // Provider fields.
  providerId: z.string().uuid().optional(),
  venueId: z.string().uuid().optional(),
  sourceServiceId: z.string().uuid().optional(),
  practitionerId: z.string().uuid().nullable().optional(),
  pricePenceOverride: z.number().int().min(0).max(PRICE_PENCE_MAX).nullable().optional(),
  durationMinutesOverride: z.number().int().min(1).max(1440).nullable().optional(),
});

export type CatalogueActionInput = z.infer<typeof catalogueActionSchema>;
