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
  cancellationPolicy?: string;
  requiresDeposit?: boolean;
}

const detailsSchemaWithTerms = detailsSchema.and(
  z.object({ acceptTerms: z.boolean().refine((v) => v === true, { message: 'You must accept the booking terms' }) })
);
type FormDataWithTerms = z.infer<typeof detailsSchemaWithTerms>;

export function DetailsStep({ slot, date, partySize, onSubmit, onBack, cancellationPolicy, requiresDeposit }: DetailsStepProps) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormDataWithTerms>({
    resolver: zodResolver(detailsSchemaWithTerms),
    defaultValues: { name: '', email: '', phone: '', dietary_notes: '', occasion: '', acceptTerms: false },
  });

  return (
    <div className="mt-6">
      <p className="text-sm text-neutral-600 mb-4">
        {date} · {slot.label} · {partySize} {partySize === 1 ? 'guest' : 'guests'}
      </p>
      {cancellationPolicy && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {cancellationPolicy}
        </p>
      )}
      <form onSubmit={handleSubmit((d) => onSubmit({ name: d.name, email: d.email || '', phone: d.phone, dietary_notes: d.dietary_notes, occasion: d.occasion }))} className="space-y-4">
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
        <div className="flex items-start gap-2">
          <input id="acceptTerms" type="checkbox" {...register('acceptTerms')} className="mt-1 rounded border-neutral-300" />
          <label htmlFor="acceptTerms" className="text-sm text-neutral-700">
            I accept the booking terms and cancellation policy.
          </label>
        </div>
        {errors.acceptTerms && <p className="text-sm text-red-600">{errors.acceptTerms.message}</p>}
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
