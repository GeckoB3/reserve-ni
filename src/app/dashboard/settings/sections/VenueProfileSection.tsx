'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCallback, useState } from 'react';
import type { VenueSettings } from '../types';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal('')),
  timezone: z.string().max(50).optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

interface VenueProfileSectionProps {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
  isAdmin: boolean;
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'venue';
}

export function VenueProfileSection({ venue, onUpdate, isAdmin }: VenueProfileSectionProps) {
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, watch } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: venue.name ?? '',
      slug: venue.slug ?? '',
      address: venue.address ?? '',
      phone: venue.phone ?? '',
      email: venue.email ?? '',
      timezone: venue.timezone ?? 'Europe/London',
    },
  });

  const nameValue = watch('name');

  const handleNameBlur = useCallback(() => {
    const slug = slugFromName(nameValue);
    if (slug) setValue('slug', slug);
  }, [nameValue, setValue]);

  const onProfileSubmit = useCallback(async (data: ProfileForm) => {
    const res = await fetch('/api/venue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        slug: data.slug,
        address: data.address || undefined,
        phone: data.phone || undefined,
        email: data.email || undefined,
        timezone: data.timezone || 'Europe/London',
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? 'Failed to save');
    }
    const updated = await res.json();
    onUpdate({
      name: updated.name,
      slug: updated.slug,
      address: updated.address ?? null,
      phone: updated.phone ?? null,
      email: updated.email ?? null,
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
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Venue profile</h2>

      <div className="mb-6">
        <span className="block text-sm font-medium text-neutral-700 mb-1">Cover photo</span>
        {venue.cover_photo_url ? (
          <img src={venue.cover_photo_url} alt="Cover" className="h-40 w-full object-cover rounded-lg mb-2" />
        ) : (
          <div className="h-40 w-full rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-500 mb-2">No cover photo</div>
        )}
        {isAdmin && (
          <>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onCoverChange} disabled={coverSaving} className="block text-sm text-neutral-600" />
            {coverSaving && <p className="mt-1 text-sm text-amber-600">Uploading…</p>}
            {coverError && <p className="mt-1 text-sm text-red-600">{coverError}</p>}
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
        <div>
          <label htmlFor="address" className="block text-sm font-medium text-neutral-700 mb-1">Address</label>
          <textarea id="address" {...register('address')} rows={2} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-neutral-700 mb-1">Phone</label>
            <input id="phone" type="tel" {...register('phone')} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
            <input id="email" type="email" {...register('email')} disabled={!isAdmin} className="w-full rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-50" />
          </div>
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
