import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import {
  SIGNUP_PENDING_BUSINESS_TYPE_KEY,
  SIGNUP_PENDING_PLAN_KEY,
  type SignupPendingPlan,
} from '@/lib/signup-pending-selection';

const PlanSchema = z.enum(['appointments', 'restaurant', 'founding']);

const PostBodySchema = z
  .object({
    plan: PlanSchema,
    business_type: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.plan === 'appointments') return true;
      return !!(data.business_type && data.business_type.trim());
    },
    { message: 'business_type is required for this plan', path: ['business_type'] },
  );

function readPendingFromMetadata(meta: Record<string, unknown> | undefined): {
  plan: SignupPendingPlan | null;
  business_type: string | null;
} {
  const rawPlan = meta?.[SIGNUP_PENDING_PLAN_KEY];
  const rawBt = meta?.[SIGNUP_PENDING_BUSINESS_TYPE_KEY];
  const planParsed = PlanSchema.safeParse(rawPlan);
  const plan = planParsed.success ? planParsed.data : null;
  const business_type =
    typeof rawBt === 'string' && rawBt.trim() ? rawBt.trim() : null;
  return { plan, business_type };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ plan: null, business_type: null });
    }
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    return NextResponse.json(readPendingFromMetadata(meta));
  } catch (err) {
    console.error('[signup/pending-selection] GET failed:', err);
    return NextResponse.json({ plan: null, business_type: null });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const json = await request.json();
    const parsed = PostBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { plan, business_type } = parsed.data;
    const admin = getSupabaseAdminClient();
    const { data: existing, error: getErr } = await admin.auth.admin.getUserById(user.id);
    if (getErr || !existing.user) {
      console.error('[signup/pending-selection] getUserById:', getErr);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    const meta = { ...(existing.user.user_metadata ?? {}) };
    meta[SIGNUP_PENDING_PLAN_KEY] = plan;
    if (plan === 'appointments') {
      delete meta[SIGNUP_PENDING_BUSINESS_TYPE_KEY];
    } else {
      meta[SIGNUP_PENDING_BUSINESS_TYPE_KEY] = business_type!.trim();
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { user_metadata: meta });
    if (updErr) {
      console.error('[signup/pending-selection] updateUserById:', updErr);
      return NextResponse.json({ error: 'Failed to save signup progress' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[signup/pending-selection] POST failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
