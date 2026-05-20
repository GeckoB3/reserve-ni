import { EMBED_IFRAME_DEFAULT_HEIGHT_PX } from '@/lib/embed/widget-frame';

/** Normalise stored or user input to 6-char hex without `#`, or null if invalid/empty. */
export function normalizeEmbedAccentHex(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const hex = raw.trim().replace(/^#/, '');
  if (hex === '') return null;
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return hex.toLowerCase();
}

export function embedAccentSearchParam(hex: string | null | undefined): string {
  const normalised = normalizeEmbedAccentHex(hex);
  return normalised ? `?accent=${normalised}` : '';
}

export function buildVenueEmbedSnippet({
  baseUrl,
  venueSlug,
  accentHex,
}: {
  baseUrl: string;
  venueSlug: string;
  accentHex?: string | null;
}): { embedUrl: string; snippet: string; accentHex: string | null } {
  const root = baseUrl.replace(/\/$/, '');
  const accent = normalizeEmbedAccentHex(accentHex);
  const embedUrl = `${root}/embed/${venueSlug}${embedAccentSearchParam(accent)}`;
  const snippet = `<iframe src="${embedUrl}" width="100%" height="${EMBED_IFRAME_DEFAULT_HEIGHT_PX}" style="border:none;overflow:hidden;" scrolling="no" id="reserveni-widget"></iframe>
<script src="${root}/embed/resize.js"></script>`;
  return { embedUrl, snippet, accentHex: accent };
}
