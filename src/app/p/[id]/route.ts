import { NextRequest, NextResponse } from 'next/server';
import { resolvePublicSiteOriginFromRequest } from '@/lib/public-base-url';

/**
 * GET /p/:token — Redirect to the deposit payment page with the same signed token.
 * Keeps SMS URLs short (`/p/...` vs `/pay?t=...`).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: code } = await params;
  const baseUrl = resolvePublicSiteOriginFromRequest(request);
  return NextResponse.redirect(new URL(`/pay?t=${encodeURIComponent(code)}`, baseUrl));
}
