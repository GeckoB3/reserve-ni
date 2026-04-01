'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCallback, useState } from 'react';
import type { VenueSettings } from '../types';
import { useNumericField } from '@/hooks/useNumericField';
import { PhoneWithCountryField } from '@/components/phone/PhoneWithCountryField';
import { normalizeToE164 } from '@/lib/phone/e164';
import { isValidWebsiteUrlInput } from '@/lib/urls/website-url';
import { buildAddress, parseAddress } from '@/lib/venue/address-format';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  address_name: z.string().max(200).optional(),
  address_street: z.string().max(200).optional(),
  address_town: z.string().max(100).optional(),
  address_postcode: z.string().max(20).optional(),
  phone: z
    .string()
    .max(24)
    .optional()
    .refine((v) => !v?.trim() || normalizeToE164(v.trim(), 'GB') !== null, {
      message: 'Enter a valid phone number',
    }),
  email: z.string().email().optional().or(z.literal('')),
  website_url: z
    .string()
    .max(2000)
    .optional()
    .refine((v) => isValidWebsiteUrlInput(v ?? ''), {
      message: 'Enter a valid web address (e.g. example.com or https://example.com)',
    }),
  cuisine_type: z.string().max(100).optional(),
  price_band: z.string().max(50).optional(),
  no_show_grace_minutes: z.number().int().min(10).max(60).optional(),
  kitchen_email: z.string().email().optional().or(z.literal('')),
  timezone: z.string().max(50).optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

interface VenueProfileSectionProps {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
  isAdmin: boolean;
  bookingModel?: string;
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'venue';
}

export function VenueProfileSection({ venue, onUpdate, isAdmin, bookingModel = 'table_reservation' }: VenueProfileSectionProps) {
  const isAppointment = isUnifiedSchedulingVenue(bookingModel);
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const { integerProps } = useNumericField();
  const int = integerProps();

  const parsedAddr = parseAddress(venue.address);

  const { register, handleSubmit, control, formState: { errors, isSubmitting }, setValue, watch } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: venue.name ?? '',
      slug: venue.slug ?? '',
      address_name: parsedAddr.name,
      address_street: parsedAddr.street,
      address_town: parsedAddr.town,
      address_postcode: parsedAddr.postcode,
      phone: venue.phone ?? '',
      email: venue.email ?? '',
      website_url: venue.website_url ?? '',
      cuisine_type: venue.cuisine_type ?? '',
      price_band: venue.price_band ?? '',
      no_show_grace_minutes: venue.no_show_grace_minutes ?? 15,
      kitchen_email: venue.kitchen_email ?? '',
      timezone: venue.timezone ?? 'Europe/London',
    },
  });

  const nameValue = watch('name');

  const handleNameBlur = useCallback(() => {
    const slug = slugFromName(nameValue);
    if (slug) setValue('slug', slug);
  }, [nameValue, setValue]);

  const onProfileSubmit = useCallback(async (data: ProfileForm) => {
    const combinedAddress = buildAddress({
      name: data.address_name ?? '',
      street: data.address_street ?? '',
      town: data.address_town ?? '',
      postcode: data.address_postcode ?? '',
    });
    const res = await fetch('/api/venue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        slug: data.slug,
        address: combinedAddress || undefined,
        phone: data.phone?.trim() ? normalizeToE164(data.phone.trim(), 'GB') ?? undefined : undefined,
        email: data.email || undefined,
        website_url: data.website_url?.trim() ?? '',
        cuisine_type: data.cuisine_type || undefined,
        price_band: data.price_band || undefined,
        no_show_grace_minutes: data.no_show_grace_minutes ?? 15,
        kitchen_email: data.kitchen_email || undefined,
        timezone: data.timezone || 'Europe/London',
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Failed to save');
    }
    const updated = (await res.json()) as {
      name: string;
      slug: string;
      address: string | null;
      phone: string | null;
      email: string | null;
      website_url: string | null;
      cuisine_type: string | null;
      price_band: string | null;
      no_show_grace_minutes: number;
      kitchen_email: string | null;
      timezone: string;
    };
    setValue('website_url', updated.website_url ?? '');
    onUpdate({
      name: updated.name,
      slug: updated.slug,
      address: updated.address ?? null,
      phone: updated.phone ?? null,
      email: updated.email ?? null,
      website_url: updated.website_url ?? null,
      cuisine_type: updated.cuisine_type ?? null,
      price_band: updated.price_band ?? null,
      no_show_grace_minutes: updated.no_show_grace_minutes ?? 15,
      kitchen_email: updated.kitchen_email ?? null,
      timezone: updated.timezone ?? venue.timezone,
    });
  }, [onUpdate, venue.timezone]);

  const onCoverChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;
    setCoverSaving(true);
    setCoverError(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/venue/cover', { method: 'POST', body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Upload failed');
      }
      const { url } = await res.json();
      const patchRes = await fetch('/api/venue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_photo_url: url }),
      });
      if (!patchRes.ok) throw new Error('Failed to update cover URL');
      onUpdate({ cover_photo_url: url });
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setCoverSaving(false);
      e.target.value = '';
    }
  }, [isAdmin, onUpdate]);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">{isAppointment ? 'Business profile' : 'Venue profile'}</h2>

      <div className="mb-6">
        <span className="block text-sm font-medium text-neutral-700 mb-1">Cover photo</span>
        {venue.cover_photo_url ? (
          <img src={venue.cover_photo_url} alt="Cover" className="h-40 w-full object-cover rounded-lg mb-2" />
        ) : (
          <div className="h-40 w-full rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-500 mb-2">No cover photo</div>
        )}
        {isAdmin && (
          <>
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:border-neutral-400 ${coverSaving ? 'opacity-50 pointer-events-none' : ''}`}>
              <svg className="h-4 w-4 text-neutral-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              {venue.cover_photo_url ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onCoverChange} disabled={coverSaving} className="sr-only" />
            </label>
            {coverSaving && <p className="mt-2 text-sm text-amber-600">Uploading…</p>}
            {coverError && <p className="mt-2 text-sm text-red-600">{coverError}</p>}
          </>
        )}
      </div>

      <form onSubmit={handleSubmit(onProfileSubmit)} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-1">Name</label>
          <input id="name" {...register('name')} onBlur={handleNameBlur} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-neutral-700 mb-1">Slug (URL)</label>
          <input id="slug" {...register('slug')} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" placeholder="my-venue" />
          <p className="mt-1 text-xs text-neutral-500">Used in booking URL: /book/[slug]</p>
          {errors.slug && <p className="mt-1 text-sm text-red-600">{errors.slug.message}</p>}
        </div>
        <fieldset>
          <legend className="block text-sm font-medium text-neutral-700 mb-2">Address</legend>
          <div className="space-y-3">
            <div>
              <label htmlFor="address_name" className="block text-xs text-neutral-500 mb-0.5">Building / venue name</label>
              <input id="address_name" {...register('address_name')} disabled={!isAdmin} placeholder="e.g. The Old Mill" className="w-full rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50" />
            </div>
            <div>
              <label htmlFor="address_street" className="block text-xs text-neutral-500 mb-0.5">Street</label>
              <input id="address_street" {...register('address_street')} disabled={!isAdmin} placeholder="e.g. 12 Main Street" className="w-full rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="address_town" className="block text-xs text-neutral-500 mb-0.5">Town / city</label>
                <input id="address_town" {...register('address_town')} disabled={!isAdmin} placeholder="e.g. Belfast" className="w-full rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50" />
              </div>
              <div>
                <label htmlFor="address_postcode" className="block text-xs text-neutral-500 mb-0.5">Postcode</label>
                <input id="address_postcode" {...register('address_postcode')} disabled={!isAdmin} placeholder="e.g. BT1 1AA" className="w-full rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50" />
              </div>
            </div>
          </div>
        </fieldset>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-neutral-700 mb-1">Phone</label>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneWithCountryField
                  id="phone"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  disabled={!isAdmin}
                  inputClassName="w-full min-w-0 rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50"
                />
              )}
            />
            {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>}
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
            <input id="email" type="email" {...register('email')} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          </div>
        </div>
        <div>
          <label htmlFor="website_url" className="block text-sm font-medium text-neutral-700 mb-1">Business website</label>
          <input
            id="website_url"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="example.com or https://example.com"
            {...register('website_url')}
            disabled={!isAdmin}
            className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Shown on your public booking page when set. You can enter a domain without https:// — we will save a secure link.
          </p>
          {errors.website_url && <p className="mt-1 text-sm text-red-600">{errors.website_url.message}</p>}
        </div>
        {!isAppointment && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cuisine_type" className="block text-sm font-medium text-neutral-700 mb-1">Cuisine type</label>
              <input id="cuisine_type" {...register('cuisine_type')} disabled={!isAdmin} placeholder="e.g. Italian, Irish, Gastropub" className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
            </div>
            <div>
              <label htmlFor="price_band" className="block text-sm font-medium text-neutral-700 mb-1">Price band</label>
              <select id="price_band" {...register('price_band')} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50">
                <option value="">Not set</option>
                <option value="£">£ — Budget</option>
                <option value="££">££ — Mid-range</option>
                <option value="£££">£££ — Fine dining</option>
              </select>
            </div>
          </div>
        )}
        <div className={`grid grid-cols-1 ${isAppointment ? '' : 'sm:grid-cols-2'} gap-4`}>
          <div>
            <label htmlFor="no_show_grace_minutes" className="block text-sm font-medium text-neutral-700 mb-1">No-show grace period (minutes)</label>
            <input id="no_show_grace_minutes" {...int.inputProps} min={10} max={60} {...register('no_show_grace_minutes', int.registerOptions)} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
            <p className="mt-1 text-xs text-neutral-500">
              {isAppointment
                ? 'How long after appointment time before staff can mark no-show (10–60 min)'
                : 'How long after reservation time before staff can mark no-show (10–60 min)'}
            </p>
            {errors.no_show_grace_minutes && <p className="mt-1 text-sm text-red-600">{errors.no_show_grace_minutes.message}</p>}
          </div>
          {!isAppointment && (
            <div>
              <label htmlFor="kitchen_email" className="block text-sm font-medium text-neutral-700 mb-1">Kitchen email</label>
              <input id="kitchen_email" type="email" {...register('kitchen_email')} disabled={!isAdmin} placeholder="kitchen@venue.com" className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
              <p className="mt-1 text-xs text-neutral-500">Receives the daily dietary digest email</p>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-neutral-700 mb-1">Timezone</label>
          <input id="timezone" {...register('timezone')} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
        </div>
        {isAdmin && (
          <button type="submit" disabled={isSubmitting} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {isSubmitting ? 'Saving…' : 'Save profile'}
          </button>
        )}
      </form>
    </section>
  );
}
