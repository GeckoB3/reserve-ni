'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AvailableSlot, GuestDetails } from './types';

const detailsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  phone: z.string().min(1, 'Phone is required').max(30),
  dietary_notes: z.string().max(1000).optional(),
  occasion: z.string().max(200).optional(),
});

type FormData = z.infer<typeof detailsSchema>;

interface DetailsStepProps {
  slot: AvailableSlot;
  date: string;
  partySize: number;
  onSubmit: (details: GuestDetails) => void;
  onBack: () => void;
}

export function DetailsStep({ slot, date, partySize, onSubmit, onBack }: DetailsStepProps) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: '', email: '', phone: '', dietary_notes: '', occasion: '' },
  });

  return (
    <div className="mt-6">
      <p className="text-sm text-neutral-600 mb-4">
        {date} · {slot.label} · {partySize} {partySize === 1 ? 'guest' : 'guests'}
      </p>
      <form onSubmit={handleSubmit((d) => onSubmit({ ...d, email: d.email || '' }))} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-1">Name *</label>
          <input id="name" {...register('name')} className="w-full rounded border border-neutral-300 px-3 py-2" />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
          <input id="email" type="email" {...register('email')} className="w-full rounded border border-neutral-300 px-3 py-2" />
          {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-neutral-700 mb-1">Phone *</label>
          <input id="phone" type="tel" {...register('phone')} className="w-full rounded border border-neutral-300 px-3 py-2" />
          {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>}
        </div>
        <div>
          <label htmlFor="dietary_notes" className="block text-sm font-medium text-neutral-700 mb-1">Dietary notes</label>
          <textarea id="dietary_notes" {...register('dietary_notes')} rows={2} className="w-full rounded border border-neutral-300 px-3 py-2" />
        </div>
        <div>
          <label htmlFor="occasion" className="block text-sm font-medium text-neutral-700 mb-1">Occasion</label>
          <input id="occasion" {...register('occasion')} placeholder="e.g. Birthday" className="w-full rounded border border-neutral-300 px-3 py-2" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onBack} className="text-sm text-neutral-600 underline">
            ← Back
          </button>
          <button type="submit" disabled={isSubmitting} className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
            {isSubmitting ? 'Booking…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
