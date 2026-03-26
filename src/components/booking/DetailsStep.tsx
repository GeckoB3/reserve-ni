'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AvailableSlot, GuestDetails } from './types';
import { normalizeToE164 } from '@/lib/phone/e164';
import { PhoneWithCountryField } from '@/components/phone/PhoneWithCountryField';
import { formatRefundDeadlineDisplay } from '@/lib/booking/cancellation-deadline';

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${SHORT_WEEKDAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

const detailsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().min(1, 'Email is required').email('Valid email required'),
  phone: z
    .string()
    .min(1, 'Phone is required')
    .max(24)
    .refine((v) => normalizeToE164(v, 'GB') !== null, 'Enter a valid mobile number'),
  dietary_notes: z.string().max(1000).optional(),
  occasion: z.string().max(200).optional(),
  /** Model B: shown as “Comments or requests”, stored as booking dietary_notes */
  comments_requests: z.string().max(1000).optional(),
});

const detailsSchemaWithTerms = detailsSchema.and(
  z.object({ acceptTerms: z.boolean().refine((v) => v === true, { message: 'You must accept the booking terms' }) })
);
type FormDataWithTerms = z.infer<typeof detailsSchemaWithTerms>;

interface DetailsStepProps {
  slot: AvailableSlot;
  date: string;
  partySize: number;
  onSubmit: (details: GuestDetails) => void;
  onBack: () => void;
  requiresDeposit?: boolean;
  depositPerPerson?: number;
  variant?: 'restaurant' | 'appointment';
  appointmentDepositPence?: number | null;
  currencySymbol?: string;
  refundNoticeHours?: number;
}

export function DetailsStep({
  slot,
  date,
  partySize,
  onSubmit,
  onBack,
  requiresDeposit,
  depositPerPerson,
  variant = 'restaurant',
  appointmentDepositPence = null,
  currencySymbol = '£',
  refundNoticeHours = 48,
}: DetailsStepProps) {
  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormDataWithTerms>({
    resolver: zodResolver(detailsSchemaWithTerms),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      dietary_notes: '',
      occasion: '',
      comments_requests: '',
      acceptTerms: false,
    },
  });

  const dateStr = formatDate(date);
  const isAppointment = variant === 'appointment';
  const depositPence = appointmentDepositPence ?? 0;
  const hasDeposit = isAppointment && depositPence > 0;
  const refundDeadlineLabel =
    hasDeposit && slot.start_time
      ? formatRefundDeadlineDisplay(date, slot.start_time, refundNoticeHours)
      : null;

  return (
    <div className="space-y-5">
      {/* Booking summary card */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600" aria-label="Go back">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{dateStr}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{slot.start_time.slice(0, 5)}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{partySize} {partySize === 1 ? 'guest' : 'guests'}</span>
        </div>
      </div>

      {isAppointment && (
        <div
          className={`rounded-xl border px-4 py-3 ${
            hasDeposit ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <p className="text-sm font-semibold text-slate-900">Cancellation policy</p>
          {!hasDeposit && <p className="mt-1 text-sm text-slate-600">Cancel for free anytime</p>}
          {hasDeposit && (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-medium text-amber-900">
                Deposit: {currencySymbol}
                {(depositPence / 100).toFixed(2)}
                {partySize > 1 ? ` (total for ${partySize} appointments)` : ''}
              </p>
              {partySize <= 1 && refundDeadlineLabel && (
                <p className="text-sm text-amber-900">
                  <span className="font-medium">Refund if you cancel in time:</span> full refund of this deposit if you cancel by{' '}
                  <span className="font-semibold">{refundDeadlineLabel}</span> (at least {refundNoticeHours} hours before your appointment starts).
                </p>
              )}
              {partySize > 1 && (
                <p className="text-sm text-amber-900">
                  <span className="font-medium">Refund if you cancel in time:</span> each appointment has its own deadline — cancel at least{' '}
                  <span className="font-semibold">{refundNoticeHours} hours</span> before that appointment&apos;s start time to receive a full refund of that
                  appointment&apos;s share of the deposit.
                </p>
              )}
              <p className="text-xs text-amber-800/90">
                After the deadline for each appointment, that share of the deposit is non-refundable. No-shows are not refunded.
              </p>
            </div>
          )}
        </div>
      )}

      {!isAppointment && requiresDeposit && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800">
                Deposit of &pound;{depositPerPerson?.toFixed(2) ?? '5.00'} per person required
              </p>
              <p className="text-xs text-amber-700">
                Full refund if cancelled 48+ hours before your reservation. No refund within 48 hours or for no-shows.
              </p>
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit((d) =>
          onSubmit({
            name: d.name,
            email: d.email || '',
            phone: normalizeToE164(d.phone, 'GB') ?? d.phone,
            dietary_notes: isAppointment
              ? (d.comments_requests?.trim() ? d.comments_requests.trim() : undefined)
              : (d.dietary_notes?.trim() ? d.dietary_notes.trim() : undefined),
            occasion: isAppointment ? undefined : (d.occasion?.trim() ? d.occasion.trim() : undefined),
          }),
        )}
        className="space-y-4"
      >
        <FormField label="Name" required error={errors.name?.message}>
          <input {...register('name')} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="Your full name" />
        </FormField>

        <FormField label="Email" required error={errors.email?.message}>
          <input type="email" {...register('email')} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="you@example.com" />
        </FormField>

        <FormField label="Phone" required error={errors.phone?.message}>
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <PhoneWithCountryField
                id="details-phone"
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                inputClassName="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            )}
          />
        </FormField>

        {!isAppointment && (
          <>
            <FormField label="Dietary notes" error={errors.dietary_notes?.message}>
              <textarea {...register('dietary_notes')} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="Allergies, vegetarian, etc." />
            </FormField>

            <FormField label="Occasion" error={errors.occasion?.message}>
              <input {...register('occasion')} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500" placeholder="e.g. Birthday, Anniversary" />
            </FormField>
          </>
        )}

        {isAppointment && (
          <FormField label="Comments or requests" error={errors.comments_requests?.message}>
            <textarea
              {...register('comments_requests')}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="Anything we should know (access needs, preferences, running late, etc.)"
            />
          </FormField>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
          <input type="checkbox" {...register('acceptTerms')} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          <span className="text-sm text-slate-600">
            I accept the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline hover:text-brand-700">booking terms</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline hover:text-brand-700">privacy policy</a>.
          </span>
        </label>
        {errors.acceptTerms && <p className="text-xs text-red-600">{errors.acceptTerms.message}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          {isSubmitting
            ? 'Processing...'
            : isAppointment && hasDeposit
              ? 'Continue to payment'
              : !isAppointment && requiresDeposit
                ? 'Continue to Payment'
                : 'Confirm Booking'}
        </button>
      </form>
    </div>
  );
}

function FormField({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
