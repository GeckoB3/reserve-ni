import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPlatformRoleInJwt } from '@/lib/platform-auth';

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

  // Unauthenticated: protect /dashboard and /super
  if (!user && (isDashboard || isPlatformUI)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
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
