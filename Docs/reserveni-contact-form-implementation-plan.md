# ReserveNI — Contact Form Implementation Plan

## Overview

Implement a Supabase-backed contact/interest form on the ReserveNI public homepage (`reserveni.com`) that allows prospective restaurant owners to express interest in signing up, ask questions, or request a demo. Submissions are stored in Supabase and trigger email notifications via SendGrid.

---

## Stack Context

- **Framework:** Next.js (App Router) deployed on Vercel
- **Database/Auth:** Supabase
- **Email:** SendGrid
- **Payments:** Stripe Connect (not relevant here)
- **SMS:** Twilio (not relevant here)
- **Styling:** Follow existing project conventions (check if Tailwind is in use)

---

## Step 1 — Database Migration

Create a new table `contact_submissions` in Supabase.

### SQL Migration

Run this in the Supabase SQL Editor or create a migration file at `supabase/migrations/<timestamp>_create_contact_submissions.sql`:

```sql
CREATE TABLE public.contact_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  restaurant_name TEXT,
  message TEXT,
  source TEXT DEFAULT 'homepage',
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- No public SELECT policy — submissions are write-only from the public.
-- Only the service role (used server-side) can read.
CREATE POLICY "Allow anonymous inserts"
  ON public.contact_submissions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Index for admin queries
CREATE INDEX idx_contact_submissions_created_at ON public.contact_submissions (created_at DESC);
CREATE INDEX idx_contact_submissions_status ON public.contact_submissions (status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Notes

- The `anon` role can INSERT but not SELECT, UPDATE, or DELETE. This prevents scraping of submitted data.
- The `source` field allows future flexibility if forms are added to other pages (e.g. a pricing page).
- The `status` field provides a lightweight CRM workflow for tracking leads.
- Check whether `update_updated_at_column()` already exists in the project — if so, skip that function definition and just create the trigger.

---

## Step 2 — Environment Variables

Confirm the following are already set in `.env.local` and in Vercel environment settings. No new variables should be needed:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SENDGRID_API_KEY=...
```

If a `CONTACT_NOTIFICATION_EMAIL` variable does not already exist, add one:

```
CONTACT_NOTIFICATION_EMAIL=andrew@reserveni.com
```

This is the address that receives notification emails when a form is submitted.

---

## Step 3 — Server Action

Create a server action to handle form submission. This keeps the logic server-side, validates input, inserts into Supabase, and sends emails via SendGrid.

### File: `src/app/actions/contact.ts`

```typescript
'use server';

import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

// Use the service role client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  restaurantName?: string;
  message?: string;
}

interface ContactFormResult {
  success: boolean;
  error?: string;
}

export async function submitContactForm(
  data: ContactFormData
): Promise<ContactFormResult> {
  try {
    // --- Validation ---
    const name = data.name?.trim();
    const email = data.email?.trim().toLowerCase();
    const phone = data.phone?.trim() || null;
    const restaurantName = data.restaurantName?.trim() || null;
    const message = data.message?.trim() || null;

    if (!name || name.length < 2) {
      return { success: false, error: 'Please enter your name.' };
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (phone && !/^[\d\s+()-]{7,20}$/.test(phone)) {
      return { success: false, error: 'Please enter a valid phone number.' };
    }

    if (message && message.length > 2000) {
      return { success: false, error: 'Message must be under 2000 characters.' };
    }

    // --- Rate limiting (basic: check for recent submissions from same email) ---
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('contact_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', fiveMinutesAgo);

    if (count && count >= 2) {
      return {
        success: false,
        error: "You've already submitted recently. Please try again shortly.",
      };
    }

    // --- Insert into Supabase ---
    const { error: dbError } = await supabase
      .from('contact_submissions')
      .insert({
        name,
        email,
        phone,
        restaurant_name: restaurantName,
        message,
        source: 'homepage',
      });

    if (dbError) {
      console.error('Supabase insert error:', dbError);
      return { success: false, error: 'Something went wrong. Please try again.' };
    }

    // --- Send notification email to ReserveNI team ---
    try {
      await sgMail.send({
        to: process.env.CONTACT_NOTIFICATION_EMAIL!,
        from: {
          email: 'noreply@reserveni.com', // Must be a verified SendGrid sender
          name: 'ReserveNI',
        },
        subject: `New enquiry from ${name}${restaurantName ? ` (${restaurantName})` : ''}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <table style="border-collapse:collapse;">
            <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Name</td><td>${name}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Email</td><td><a href="mailto:${email}">${email}</a></td></tr>
            ${phone ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Phone</td><td>${phone}</td></tr>` : ''}
            ${restaurantName ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Restaurant</td><td>${restaurantName}</td></tr>` : ''}
            ${message ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Message</td><td>${message}</td></tr>` : ''}
          </table>
          <p style="color:#888;font-size:12px;margin-top:16px;">Submitted via reserveni.com homepage</p>
        `,
      });
    } catch (emailError) {
      // Log but don't fail the submission — the data is already saved
      console.error('SendGrid notification error:', emailError);
    }

    // --- Send confirmation email to the person ---
    try {
      await sgMail.send({
        to: email,
        from: {
          email: 'noreply@reserveni.com',
          name: 'ReserveNI',
        },
        subject: 'Thanks for your interest in ReserveNI',
        html: `
          <p>Hi ${name},</p>
          <p>Thanks for getting in touch! We've received your enquiry and a member of our team will be in contact shortly.</p>
          <p>In the meantime, if you have any questions, feel free to reply to this email.</p>
          <br/>
          <p>Best regards,<br/>The ReserveNI Team</p>
        `,
      });
    } catch (emailError) {
      console.error('SendGrid confirmation error:', emailError);
    }

    return { success: true };
  } catch (error) {
    console.error('Contact form error:', error);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
```

### Notes

- Uses the **service role** client (not the anon client) so it can also read the table for rate limiting. The anon key would work for inserts given the RLS policy, but service role is needed for the SELECT in the rate limiter.
- Email sending is wrapped in its own try/catch so a SendGrid failure doesn't lose the submission.
- Basic rate limiting prevents spam. For production hardening, consider adding a honeypot field or Turnstile/reCAPTCHA (see Step 6).
- Ensure `noreply@reserveni.com` (or whichever sender) is verified in SendGrid's Sender Authentication settings.

---

## Step 4 — Contact Form Component

Create a reusable React component for the contact form.

### File: `src/components/ContactForm.tsx`

```typescript
'use client';

import { useState } from 'react';
import { submitContactForm } from '@/app/actions/contact';

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    restaurantName: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    const result = await submitContactForm(formData);

    if (result.success) {
      setStatus('success');
      setFormData({ name: '', email: '', phone: '', restaurantName: '', message: '' });
    } else {
      setStatus('error');
      setErrorMessage(result.error || 'Something went wrong.');
    }
  };

  if (status === 'success') {
    return (
      <div className="text-center py-8">
        <h3 className="text-xl font-semibold text-green-600 mb-2">Thanks for getting in touch!</h3>
        <p className="text-gray-600">We'll be in contact shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto">
      {/* Name — required */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          id="name"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Your name"
        />
      </div>

      {/* Email — required */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">Email *</label>
        <input
          type="email"
          id="email"
          name="email"
          required
          value={formData.email}
          onChange={handleChange}
          className="w-full border rounded-lg px-3 py-2"
          placeholder="you@restaurant.com"
        />
      </div>

      {/* Phone — optional */}
      <div>
        <label htmlFor="phone" className="block text-sm font-medium mb-1">Phone</label>
        <input
          type="tel"
          id="phone"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          className="w-full border rounded-lg px-3 py-2"
          placeholder="028 xxxx xxxx"
        />
      </div>

      {/* Restaurant name — optional */}
      <div>
        <label htmlFor="restaurantName" className="block text-sm font-medium mb-1">Restaurant name</label>
        <input
          type="text"
          id="restaurantName"
          name="restaurantName"
          value={formData.restaurantName}
          onChange={handleChange}
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Your restaurant"
        />
      </div>

      {/* Message — optional */}
      <div>
        <label htmlFor="message" className="block text-sm font-medium mb-1">Message</label>
        <textarea
          id="message"
          name="message"
          rows={4}
          value={formData.message}
          onChange={handleChange}
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Tell us about your restaurant, or ask us anything..."
          maxLength={2000}
        />
      </div>

      {/* Error display */}
      {status === 'error' && (
        <p className="text-red-600 text-sm">{errorMessage}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full bg-[#4E6B78] hover:bg-[#3d545f] text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'submitting' ? 'Sending...' : 'Get in touch'}
      </button>
    </form>
  );
}
```

### Notes

- Uses the new brand colour `#4E6B78` for the submit button. Adjust hover state and other colours to match your existing design system.
- The Tailwind classes above are generic — adapt to match the styling conventions already in use across the ReserveNI codebase (e.g. if you have a `Button` component, use that instead).
- The Belfast-format phone placeholder (`028 xxxx xxxx`) is deliberate for the NI audience.
- The `'use client'` directive is required because the component uses `useState`.

---

## Step 5 — Add to Homepage

Integrate the `<ContactForm />` component into the homepage. The exact placement depends on your current page layout, but a natural position is near the bottom of the landing page, above the footer, as a distinct section.

### In your homepage file (e.g. `src/app/page.tsx` or wherever the public landing page lives):

```tsx
import ContactForm from '@/components/ContactForm';

// ... inside the page JSX, add a section:

<section id="contact" className="py-16 px-4 bg-gray-50">
  <div className="max-w-2xl mx-auto text-center mb-8">
    <h2 className="text-3xl font-bold mb-2">Interested in ReserveNI?</h2>
    <p className="text-gray-600">
      Whether you're ready to get started or just want to learn more, drop us your
      details and we'll be in touch.
    </p>
  </div>
  <ContactForm />
</section>
```

### Notes

- The `id="contact"` anchor allows linking directly to the form (e.g. from a nav item or CTA button elsewhere on the page via `href="#contact"`).
- If there's an existing CTA button on the hero section (e.g. "Get started"), update it to scroll to `#contact`.

---

## Step 6 — Spam Protection (Recommended)

For MVP, the server-side rate limiter (Step 3) provides basic protection. For production hardening, add one of the following:

### Option A — Honeypot field (zero dependencies, quick win)

Add a hidden field to the form that real users won't fill in but bots will:

```tsx
{/* Honeypot — hidden from real users */}
<input
  type="text"
  name="company_url"
  value={formData.companyUrl}
  onChange={handleChange}
  className="hidden"
  tabIndex={-1}
  autoComplete="off"
  aria-hidden="true"
/>
```

Then in the server action, reject any submission where `company_url` has a value:

```typescript
if (data.companyUrl) {
  // Silently succeed to avoid tipping off bots
  return { success: true };
}
```

### Option B — Cloudflare Turnstile (stronger, free)

If spam becomes a real problem, add Cloudflare Turnstile. It's free, privacy-friendly, and doesn't require users to solve CAPTCHAs.

This would involve adding the Turnstile widget to the form component and verifying the token server-side in the action. Defer this until there's evidence of spam.

---

## Step 7 — Testing Checklist

Before deploying, verify:

1. **Happy path:** Submit the form with all fields filled. Confirm the row appears in the `contact_submissions` table in Supabase. Confirm both the notification and confirmation emails arrive.
2. **Required fields only:** Submit with just name and email. Confirm it works.
3. **Validation:** Try submitting with an invalid email, a too-short name, and an invalid phone number. Confirm appropriate error messages appear.
4. **Rate limiting:** Submit the same email 3 times quickly. Confirm the third is rejected.
5. **Success state:** After a successful submission, confirm the form is replaced with the thank-you message.
6. **Mobile:** Test the form layout on mobile viewports.
7. **Email rendering:** Check both the notification and confirmation emails render correctly in Gmail and Outlook.

---

## Step 8 — Future Enhancements (Post-MVP)

These are not required now but worth noting for later:

- **Admin dashboard view:** Add a page within the venue dashboard (authenticated, admin-only) to list and manage contact submissions, update their status, and add notes. Query the `contact_submissions` table using the service role.
- **SendGrid dynamic templates:** Replace the inline HTML with SendGrid dynamic templates for branded, maintainable emails.
- **Slack notification:** If you and your co-founder use Slack, send a real-time notification to a channel via Slack webhook when a submission arrives — faster than email for response time.
- **Analytics event:** Fire a conversion event (e.g. `gtag('event', 'contact_form_submit')`) on success for tracking in Google Analytics.

---

## File Summary

| File | Action | Description |
|---|---|---|
| `supabase/migrations/<timestamp>_create_contact_submissions.sql` | Create | Database migration |
| `.env.local` | Update | Add `CONTACT_NOTIFICATION_EMAIL` if not present |
| `src/app/actions/contact.ts` | Create | Server action for validation, DB insert, emails |
| `src/components/ContactForm.tsx` | Create | Client-side form component |
| `src/app/page.tsx` (or homepage file) | Update | Add contact section with `<ContactForm />` |
