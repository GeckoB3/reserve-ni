import { NextRequest, NextResponse } from 'next/server';
import { resolveLinkAdmin, enforceLinkRateLimit } from '@/lib/linked-accounts/route-helpers';
import { loadCollectiveAccess } from '@/lib/linked-accounts/collective-access';
import { parseImageUploadFromFormData } from '@/lib/venue/parse-image-upload';
import { uploadVenueStorageImage } from '@/lib/venue/upload-venue-storage-image';
import { deleteVenueStorageImageByPublicUrl } from '@/lib/venue/delete-venue-storage-image';

const MAX_SIZE = 5 * 1024 * 1024;

/** Combined-page image kinds → the (shared) venue storage bucket each lives in. */
const KIND_BUCKETS = {
  logo: 'venue-logos',
  cover: 'venue-covers',
  gallery: 'venue-gallery',
  offering: 'venue-service-photos',
  team: 'venue-team-photos',
} as const;

type AssetKind = keyof typeof KIND_BUCKETS;

function resolveKind(request: NextRequest): AssetKind | null {
  const kind = request.nextUrl.searchParams.get('kind');
  return kind && kind in KIND_BUCKETS ? (kind as AssetKind) : null;
}

/**
 * POST /api/venue/collectives/[id]/page-asset?kind=logo|cover|gallery|offering|team
 * Upload a combined-page image (host only). Reuses the venue storage buckets with a
 * `c/{collectiveId}` path prefix — no new buckets, no migration. Returns the public URL.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveLinkAdmin();
  if (!resolved.ok) return resolved.response;
  const { ctx } = resolved;
  const { id } = await params;

  const kind = resolveKind(request);
  if (!kind) return NextResponse.json({ error: 'Invalid asset kind.' }, { status: 400 });

  const limited = enforceLinkRateLimit(ctx.venueId, 'collective-upload', 30, 60_000);
  if (limited) return limited;

  try {
    const access = await loadCollectiveAccess(ctx.admin, id, ctx.venueId);
    if (!access) return NextResponse.json({ error: 'Collective not found.' }, { status: 404 });
    if (access.status !== 'active') {
      return NextResponse.json({ error: 'This collective has been dissolved.' }, { status: 409 });
    }
    if (!access.isHost) {
      return NextResponse.json(
        { error: 'Only the host venue can upload combined-page images.' },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const parsed = await parseImageUploadFromFormData(formData, MAX_SIZE);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const result = await uploadVenueStorageImage(ctx.admin, KIND_BUCKETS[kind], `c/${id}`, parsed);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ url: result.publicUrl });
  } catch (err) {
    console.error('POST /api/venue/collectives/[id]/page-asset failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/venue/collectives/[id]/page-asset?kind=... — best-effort storage cleanup
 * for a removed combined-page image (host only). Body: `{ url }`.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveLinkAdmin();
  if (!resolved.ok) return resolved.response;
  const { ctx } = resolved;
  const { id } = await params;

  const kind = resolveKind(request);
  if (!kind) return NextResponse.json({ error: 'Invalid asset kind.' }, { status: 400 });

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const url = typeof body.url === 'string' ? body.url : '';
  if (!url) return NextResponse.json({ error: 'No url provided' }, { status: 400 });

  try {
    const access = await loadCollectiveAccess(ctx.admin, id, ctx.venueId);
    if (!access) return NextResponse.json({ error: 'Collective not found.' }, { status: 404 });
    if (!access.isHost) {
      return NextResponse.json(
        { error: 'Only the host venue can manage combined-page images.' },
        { status: 403 },
      );
    }
    const result = await deleteVenueStorageImageByPublicUrl(ctx.admin, KIND_BUCKETS[kind], `c/${id}`, url);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/venue/collectives/[id]/page-asset failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
