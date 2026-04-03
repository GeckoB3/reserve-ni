'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { PUBLIC_BOOK_TAB_SLUGS } from '@/lib/booking/public-book-tabs';

interface WidgetSectionProps {
  venueName: string;
  venueSlug: string;
  baseUrl: string;
}

export function WidgetSection({ venueName, venueSlug, baseUrl }: WidgetSectionProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [accentColour, setAccentColour] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const embedUrl = `${baseUrl.replace(/\/$/, '')}/embed/${venueSlug}${accentColour ? `?accent=${accentColour.replace(/^#/, '')}` : ''}`;
  const bookUrl = `${baseUrl.replace(/\/$/, '')}/book/${venueSlug}`;
  const snippet = `<iframe src="${embedUrl}" width="100%" height="700" style="border:none;overflow:hidden;" scrolling="no" id="reserveni-widget"></iframe>
<script src="${baseUrl.replace(/\/$/, '')}/embed/resize.js"></script>`;

  useEffect(() => {
    QRCode.toDataURL(bookUrl, { width: 256, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [bookUrl]);

  const copyEmbed = useCallback(() => {
    void navigator.clipboard.writeText(snippet);
  }, [snippet]);

  const downloadQr = useCallback(() => {
    if (!qrDataUrl || !canvasRef.current) return;
    const canvas = document.createElement('canvas');
    const qrSize = 400;
    const padding = 40;
    const textHeight = 48;
    canvas.width = qrSize + padding * 2;
    canvas.height = qrSize + padding * 2 + textHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, padding, padding, qrSize, qrSize);
      ctx.fillStyle = '#111';
      ctx.font = '24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(venueName, canvas.width / 2, qrSize + padding + 32);
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `reserve-ni-qr-${venueSlug}.png`;
      a.click();
    };
    img.src = qrDataUrl;
  }, [qrDataUrl, venueName, venueSlug]);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-900">Embed code</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Add this to your website to show the booking form in an iframe. The widget will resize to fit the content.
        </p>
        <div className="mt-4">
          <label htmlFor="accent" className="block text-sm font-medium text-neutral-700 mb-1">Accent colour (optional)</label>
          <div className="flex items-center gap-2">
            <input
              id="accent"
              type="text"
              value={accentColour}
              onChange={(e) => setAccentColour(e.target.value.replace(/[^a-fA-F0-9#]/g, '').slice(0, 7))}
              placeholder="#4F46E5"
              className="w-32 rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            {accentColour && (
              <div className="h-8 w-8 rounded border border-neutral-300" style={{ backgroundColor: `#${accentColour.replace(/^#/, '')}` }} />
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Hex colour for buttons in the embedded widget (e.g. 4F46E5)</p>
        </div>
        <pre className="mt-4 overflow-x-auto rounded border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-800">
          {snippet}
        </pre>
        <button
          type="button"
          onClick={copyEmbed}
          className="mt-3 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Copy code
        </button>
        <p className="mt-4 text-sm text-neutral-600">
          <span className="font-medium text-neutral-800">Open a specific tab (embed matches /book)</span> — append{' '}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">?tab=</code> with the same slug as the full-page
          booking URL. Canonical values: {PUBLIC_BOOK_TAB_SLUGS.join(', ')}. Combine with accent using{' '}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">&amp;</code> (e.g.{' '}
          <code className="break-all rounded bg-neutral-100 px-1 py-0.5 text-xs">
            /embed/{venueSlug}?accent=4F46E5&amp;tab=events
          </code>
          ).
        </p>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-900">QR code</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Link to your booking page. Suitable for table cards, menus, or window stickers.
        </p>
        <div className="mt-4 flex flex-col items-center gap-4">
          {qrDataUrl && (
            <>
              <img src={qrDataUrl} alt="QR code" className="h-64 w-64 rounded border border-neutral-200" />
              <canvas ref={canvasRef} className="hidden" />
              <button
                type="button"
                onClick={downloadQr}
                className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Download QR code
              </button>
              <p className="text-center text-sm text-neutral-500">{venueName}</p>
            </>
          )}
          {!qrDataUrl && <p className="text-sm text-neutral-500">Generating QR code…</p>}
        </div>
      </section>
    </div>
  );
}
