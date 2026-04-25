import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPlatformRoleInJwt } from '@/lib/platform-auth';
import {
  SIGNUP_PENDING_BUSINESS_TYPE_KEY,
  SIGNUP_PENDING_PLAN_KEY,
  isSignupPaymentReady,
} from '@/lib/signup-pending-selection';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session; required so server and client stay in sync
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isDashboard = pathname.startsWith('/dashboard');
  const isPlatformUI = pathname.startsWith('/super');
  const isPlatformAPI = pathname.startsWith('/api/platform');
  const signupPlan = request.nextUrl.searchParams.get('plan');

  if (pathname === '/signup/business-type' && (signupPlan === 'restaurant' || signupPlan === 'founding')) {
    const url = request.nextUrl.clone();
    url.pathname = '/signup/plan';
    url.searchParams.set('plan', signupPlan);
    return NextResponse.redirect(url);
  }

  if (
    user &&
    (pathname === '/signup' || pathname === '/signup/business-type' || pathname === '/signup/plan')
  ) {
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const pendingPlan = meta?.[SIGNUP_PENDING_PLAN_KEY];
    const pendingBusinessType = meta?.[SIGNUP_PENDING_BUSINESS_TYPE_KEY];
    if (
      isSignupPaymentReady(
        typeof pendingPlan === 'string' ? pendingPlan : null,
        typeof pendingBusinessType === 'string' ? pendingBusinessType : null,
      )
    ) {
      return NextResponse.redirect(new URL('/signup/payment', request.url));
    }
  }

  // Unauthenticated: protect /dashboard and /super
  if (!user && (isDashboard || isPlatformUI)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  /** Block mutating venue APIs when subscription is past due (billing routes exempt). */
  const method = request.method.toUpperCase();
  const isVenueMutating =
    user &&
    pathname.startsWith('/api/venue/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  function isVenueBillingExemptVenuePath(p: string): boolean {
    if (p === '/api/venue/change-plan') return true;
    if (p.startsWith('/api/venue/light-plan')) return true;
    if (p.startsWith('/api/venue/stripe-connect')) return true;
    if (p.startsWith('/api/venue/staff/me')) return true;
    if (p === '/api/venue/staff/change-password') return true;
    if (p.startsWith('/api/venue/support')) return true;
    return false;
  }

  if (isVenueMutating && !isVenueBillingExemptVenuePath(pathname)) {
    const email = (user?.email ?? '').trim();
    if (!email) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    const { data: staffRows } = await supabase
      .from('staff')
      .select('venue_id')
      .ilike('email', email.toLowerCase())
      .limit(1);
    const vid = staffRows?.[0]?.venue_id as string | undefined;
    if (vid) {
      const { data: venueRow } = await supabase
        .from('venues')
        .select('plan_status')
        .eq('id', vid)
        .maybeSingle();
      const ps = (venueRow as { plan_status?: string | null } | null)?.plan_status;
      if (ps === 'past_due') {
        return NextResponse.json(
          {
            error:
              'Billing is past due. Add or update your payment method under Settings → Plan to continue editing.',
            code: 'VENUE_PAST_DUE',
          },
          { status: 403 },
        );
      }
    }
  }

  // Platform routes: require superuser role + email allowlist
  if ((isPlatformUI || isPlatformAPI) && user) {
    const isSuperuser = isPlatformRoleInJwt(
      user.app_metadata as Record<string, unknown> | undefined,
      user.email,
    );
    if (!isSuperuser) {
      if (isPlatformAPI) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Logged-in user on /login: redirect to the right surface
  if (user && pathname === '/login') {
    const explicit = request.nextUrl.searchParams.get('redirectTo');
    if (explicit) {
      return NextResponse.redirect(new URL(explicit, request.url));
    }
    const isSuperuser = isPlatformRoleInJwt(
      user.app_metadata as Record<string, unknown> | undefined,
      user.email,
    );
    return NextResponse.redirect(new URL(isSuperuser ? '/super' : '/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
