'use client';

/**
 * Combined booking page manager (plan §7). The host curates the unified service
 * catalogue (merge suggestions → offerings → cross-venue providers + overrides)
 * and chooses where the page is served; each member approves the commercial
 * terms for its own calendars (plan D6) and sets its solo-page behaviour (D2).
 */

import { useCallback, useEffect, useState } from 'react';
import { Modal, btnPrimary, btnSecondary, btnDanger } from './linked-accounts-ui';
import { Pill } from '@/components/ui/dashboard/Pill';
import {
  BOOKING_FONT_PRESET_KEYS,
  BOOKING_FONT_PRESET_LABELS,
  type BookingPageConfig,
} from '@/lib/booking/booking-page-theme';
import type { CollectiveView } from '@/lib/linked-accounts/collectives';
import type {
  CatalogueManagementView,
  CatalogueItemView,
  CatalogueProviderView,
  CatalogueMemberSource,
  MergeSuggestion,
} from '@/lib/linked-accounts/catalogue';

const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';
const smallInput =
  'w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

function fmtPrice(p: number | null): string {
  return p == null ? '—' : `£${(p / 100).toFixed(2)}`;
}
function fmtDuration(m: number | null): string {
  return m == null ? '—' : `${m} min`;
}
function poundsToPence(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function CombinedPageManager({
  collective,
  onClose,
  onChanged,
}: {
  collective: CollectiveView;
  onClose: () => void;
  /** Called after a change that affects the collective list (mode/address). */
  onChanged: () => void;
}) {
  const [catalogue, setCatalogue] = useState<CatalogueManagementView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = collective.isHost;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/venue/collectives/${collective.id}/catalogue`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load the catalogue.');
      setCatalogue(json.catalogue ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the catalogue.');
    } finally {
      setLoading(false);
    }
  }, [collective.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** PATCH a catalogue action; refresh from the response. */
  const action = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/venue/collectives/${collective.id}/catalogue`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Action failed.');
      if (json.catalogue) setCatalogue(json.catalogue);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** PATCH the collective settings (mode / address); refresh both views. */
  const settings = async (body: Record<string, unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/venue/collectives/${collective.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to update settings.');
      onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      maxWidth="max-w-3xl"
      title={`Combined booking page — ${collective.name}`}
      description={
        isHost
          ? 'Choose what your combined page offers and where it lives. Members approve the prices shown for their own calendars.'
          : 'Review the combined-page offerings that use your calendars, and choose what your own booking page does.'
      }
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        {isHost ? (
          <>
            <PageAddressSection collective={collective} busy={busy} onSettings={settings} />
            <PageDesignSection collective={collective} busy={busy} onSettings={settings} />
          </>
        ) : null}

        {loading ? (
          <div className="space-y-2" aria-busy="true">
            <span className="sr-only">Loading the catalogue…</span>
            <div className="skeleton h-20 rounded-xl" />
            <div className="skeleton h-20 rounded-xl" />
          </div>
        ) : !catalogue ? null : isHost ? (
          <HostCatalogue catalogue={catalogue} busy={busy} action={action} />
        ) : (
          <MemberConsole
            catalogue={catalogue}
            collective={collective}
            busy={busy}
            action={action}
            onSolo={(behavior) => action0SoloBehavior(collective.id, behavior, setBusy, setError, load)}
          />
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>
          Done
        </button>
      </div>
    </Modal>
  );
}

/** Member solo-page behaviour goes through the members route, not the catalogue route. */
async function action0SoloBehavior(
  collectiveId: string,
  behavior: 'keep_live' | 'redirect',
  setBusy: (b: boolean) => void,
  setError: (e: string | null) => void,
  reload: () => Promise<void>,
): Promise<void> {
  setBusy(true);
  setError(null);
  try {
    const res = await fetch(`/api/venue/collectives/${collectiveId}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'configure', soloPageBehavior: behavior }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed to update.');
    await reload();
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to update.');
  } finally {
    setBusy(false);
  }
}

// ---------------------------------------------------------------------------
// Booking page address (host) — the combined page works like one venue
// ---------------------------------------------------------------------------

function PageAddressSection({
  collective,
  busy,
  onSettings,
}: {
  collective: CollectiveView;
  busy: boolean;
  onSettings: (body: Record<string, unknown>) => Promise<void>;
}) {
  const adopt = collective.slugStrategy === 'adopt_member';
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-bold text-slate-900">Booking page address</p>
      <p className="text-xs text-slate-500">
        Your combined page works like a single venue — one services menu and one team across all
        members. Choose where customers reach it.
      </p>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="radio"
          className="mt-0.5"
          name="slug-strategy"
          disabled={busy}
          checked={!adopt}
          onChange={() => void onSettings({ slugStrategy: 'dedicated' })}
        />
        <span>
          Dedicated address — <code className="text-xs">/book/c/{collective.slug}</code>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="radio"
          className="mt-0.5"
          name="slug-strategy"
          disabled={busy}
          checked={adopt}
          onChange={() => {
            const first = collective.members.find((m) => m.status === 'active');
            if (first) void onSettings({ slugStrategy: 'adopt_member', adoptedVenueId: first.venueId });
          }}
        />
        <span>Use a member venue’s existing booking address</span>
      </label>
      {adopt ? (
        <div className="ml-6">
          <select
            className={inputCls}
            disabled={busy}
            value={collective.adoptedVenueId ?? ''}
            onChange={(e) =>
              void onSettings({ slugStrategy: 'adopt_member', adoptedVenueId: e.target.value })
            }
          >
            {collective.members
              .filter((m) => m.status === 'active')
              .map((m) => (
                <option key={m.venueId} value={m.venueId}>
                  {m.venueName}
                </option>
              ))}
          </select>
          <p className="mt-1 text-xs text-amber-600">
            That venue’s own page will show the combined page. It can keep a separate page only under
            a new address.
          </p>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page design (host) — single-venue-grade customisation (plan §22 / G6)
// ---------------------------------------------------------------------------

type PageCfg = BookingPageConfig & { cover_photo_url?: string | null };

function PageDesignSection({
  collective,
  busy,
  onSettings,
}: {
  collective: CollectiveView;
  busy: boolean;
  onSettings: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [cfg, setCfg] = useState<PageCfg>((collective.bookingPageConfig ?? {}) as PageCfg);
  const previewUrl = `/book/c/${collective.slug}`;

  // Persist the whole config so partial edits never clobber other keys.
  const save = (patch: Partial<PageCfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    void onSettings({ bookingPageConfig: next });
  };
  // Text fields: edit locally, persist on blur.
  const setLocal = (patch: Partial<PageCfg>) => setCfg((c) => ({ ...c, ...patch }));
  const persist = () => void onSettings({ bookingPageConfig: cfg });

  const colour = (label: string, key: 'brand_primary' | 'brand_accent') => (
    <label className="text-xs text-slate-600">
      {label}
      <input
        type="color"
        className="mt-1 block h-9 w-16 cursor-pointer rounded border border-slate-200"
        value={(cfg[key] as string | null) ?? '#003B6F'}
        disabled={busy}
        onChange={(e) => save({ [key]: e.target.value } as Partial<PageCfg>)}
      />
    </label>
  );

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">Page design</p>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          Preview page ↗
        </a>
      </div>
      <p className="text-xs text-slate-500">
        Customers see your combined page as one venue. These control its look and content.
      </p>

      <div className="flex flex-wrap items-end gap-4">
        {colour('Brand colour', 'brand_primary')}
        {colour('Accent', 'brand_accent')}
        <label className="text-xs text-slate-600">
          Font
          <select
            className={`mt-1 block ${inputCls} w-48`}
            value={(cfg.font_preset as string | null) ?? 'default'}
            disabled={busy}
            onChange={(e) => save({ font_preset: e.target.value as PageCfg['font_preset'] })}
          >
            {BOOKING_FONT_PRESET_KEYS.map((k) => (
              <option key={k} value={k}>
                {BOOKING_FONT_PRESET_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs text-slate-600">
        Cover image URL
        <input
          className={`mt-1 ${inputCls}`}
          placeholder="https://…"
          value={(cfg.cover_photo_url as string | null) ?? ''}
          disabled={busy}
          onChange={(e) => setLocal({ cover_photo_url: e.target.value })}
          onBlur={persist}
        />
      </label>

      <label className="block text-xs text-slate-600">
        Welcome / about
        <textarea
          className={`mt-1 ${inputCls}`}
          rows={2}
          maxLength={2000}
          value={(cfg.about as string | null) ?? ''}
          disabled={busy}
          onChange={(e) => setLocal({ about: e.target.value })}
          onBlur={persist}
        />
      </label>

      <label className="block text-xs text-slate-600">
        Announcement banner
        <input
          className={`mt-1 ${inputCls}`}
          maxLength={300}
          value={(cfg.announcement as string | null) ?? ''}
          disabled={busy}
          onChange={(e) => setLocal({ announcement: e.target.value })}
          onBlur={persist}
        />
      </label>

      <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3">
        <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Tabs</span>
        {([
          ['show_services_tab', 'Services'],
          ['show_team_tab', 'Team'],
          ['show_about_tab', 'About'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={Boolean(cfg[key])}
              disabled={busy}
              onChange={(e) => save({ [key]: e.target.checked } as Partial<PageCfg>)}
            />
            {label}
          </label>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Host catalogue builder
// ---------------------------------------------------------------------------

function HostCatalogue({
  catalogue,
  busy,
  action,
}: {
  catalogue: CatalogueManagementView;
  busy: boolean;
  action: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [newItemName, setNewItemName] = useState('');
  const activeItems = catalogue.items.filter((i) => i.status === 'active');

  return (
    <div className="space-y-4">
      {catalogue.mergeSuggestions.length > 0 ? (
        <MergeSuggestions suggestions={catalogue.mergeSuggestions} busy={busy} action={action} />
      ) : null}

      <VenueServicesPicker
        memberSources={catalogue.memberSources}
        items={activeItems}
        busy={busy}
        action={action}
      />

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <p className="text-sm font-bold text-slate-900">Offerings on your combined page</p>
        </div>
        {activeItems.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing on the page yet. Add services from your venues above, or create a custom offering
            below.
          </p>
        ) : (
          activeItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              memberSources={catalogue.memberSources}
              busy={busy}
              action={action}
            />
          ))
        )}
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder="Custom offering name (e.g. 60-min Deep Tissue Massage)"
            value={newItemName}
            disabled={busy}
            onChange={(e) => setNewItemName(e.target.value)}
          />
          <button
            type="button"
            className={btnSecondary}
            disabled={busy || newItemName.trim().length === 0}
            onClick={async () => {
              const ok = await action({ action: 'create_item', name: newItemName.trim() });
              if (ok) setNewItemName('');
            }}
          >
            Add custom
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * The direct "pick which pre-existing services to include" view (plan §22 / the
 * brief's "choose what services to offer"). Lists each member venue's bookable
 * services; "Add" includes one on the combined page — seeding a new offering
 * from it, or merging into an existing same-named offering (so the same service
 * from two venues becomes one bookable item). Already-included services show as
 * "Added".
 */
function VenueServicesPicker({
  memberSources,
  items,
  busy,
  action,
}: {
  memberSources: CatalogueMemberSource[];
  items: CatalogueItemView[];
  busy: boolean;
  action: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  // Services already on the page (by venue + source service).
  const included = new Set<string>();
  for (const it of items) {
    for (const p of it.providers) {
      if (p.status !== 'removed') included.add(`${p.venueId}:${p.sourceServiceId}`);
    }
  }

  const addService = (
    venueId: string,
    svc: { id: string; name: string; durationMinutes: number | null; pricePence: number | null },
  ) => {
    const existing = items.find(
      (i) => i.status === 'active' && i.name.trim().toLowerCase() === svc.name.trim().toLowerCase(),
    );
    if (existing) {
      // Merge into the same-named offering (one bookable item across venues).
      return action({
        action: 'add_provider',
        itemId: existing.id,
        venueId,
        sourceServiceId: svc.id,
        practitionerId: null,
      });
    }
    return action({
      action: 'create_item',
      name: svc.name,
      defaultPricePence: svc.pricePence,
      defaultDurationMinutes: svc.durationMinutes,
      sourceServiceIds: [{ venueId, sourceServiceId: svc.id }],
    });
  };

  const anyServices = memberSources.some((m) => m.services.length > 0);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-bold text-slate-900">Choose services to offer</p>
      <p className="text-xs text-slate-500">
        Pick which services from each venue appear on the combined page. Adding the same-named
        service from two venues merges it into one bookable offering.
      </p>
      {!anyServices ? (
        <p className="text-sm text-slate-500">No bookable services found in the member venues.</p>
      ) : (
        memberSources.map((ms) => (
          <div key={ms.venueId} className="space-y-1">
            <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
              {ms.venueName}
            </p>
            {ms.services.length === 0 ? (
              <p className="py-1 text-xs text-slate-400">No bookable services.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {ms.services.map((s) => {
                  const isIn = included.has(`${ms.venueId}:${s.id}`);
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0 text-slate-700">
                        {s.name}
                        <span className="ml-2 text-xs text-slate-500">
                          {s.durationMinutes != null ? `${s.durationMinutes} min` : ''}
                          {s.pricePence != null ? ` · £${(s.pricePence / 100).toFixed(2)}` : ''}
                        </span>
                      </span>
                      {isIn ? (
                        <span className="shrink-0 text-xs font-medium text-emerald-600">Added ✓</span>
                      ) : (
                        <button
                          type="button"
                          className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => void addService(ms.venueId, s)}
                        >
                          Add
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))
      )}
    </section>
  );
}

function MergeSuggestions({
  suggestions,
  busy,
  action,
}: {
  suggestions: MergeSuggestion[];
  busy: boolean;
  action: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-brand-100 bg-brand-50/50 p-4">
      <p className="text-sm font-bold text-slate-900">Suggested merges</p>
      <p className="text-xs text-slate-500">
        These services look similar across venues. Merge each into one offering customers can book
        from any of the venues.
      </p>
      {suggestions.map((s) => (
        <div
          key={s.key}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">{s.canonicalName}</p>
            <p className="text-xs text-slate-500">
              {s.members.length} venues: {s.members.map((m) => m.name).join(', ')}
            </p>
          </div>
          <button
            type="button"
            className={btnSecondary}
            disabled={busy}
            onClick={() =>
              void action({
                action: 'create_item',
                name: s.canonicalName,
                sourceServiceIds: s.members.map((m) => ({
                  venueId: m.venueId,
                  sourceServiceId: m.serviceId,
                })),
              })
            }
          >
            Merge into one offering
          </button>
        </div>
      ))}
    </section>
  );
}

function ItemCard({
  item,
  memberSources,
  busy,
  action,
}: {
  item: CatalogueItemView;
  memberSources: CatalogueMemberSource[];
  busy: boolean;
  action: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [defaultPrice, setDefaultPrice] = useState(
    item.defaultPricePence == null ? '' : (item.defaultPricePence / 100).toFixed(2),
  );
  const [defaultDuration, setDefaultDuration] = useState(
    item.defaultDurationMinutes == null ? '' : String(item.defaultDurationMinutes),
  );
  const [imageUrl, setImageUrl] = useState(item.imageUrl ?? '');
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{item.name}</p>
          <p className="text-xs text-slate-500">
            {item.providers.length} calendar{item.providers.length === 1 ? '' : 's'} ·{' '}
            {item.pricingDisplay === 'from'
              ? 'shows “from” price'
              : item.pricingDisplay === 'fixed'
                ? 'fixed price'
                : 'price per provider'}
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-rose-500 hover:text-rose-700 disabled:opacity-50"
          disabled={busy}
          onClick={() => void action({ action: 'archive_item', itemId: item.id })}
        >
          Remove offering
        </button>
      </div>

      {/* Default price / duration + pricing display */}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-600">
          Default price (£)
          <input
            className={`mt-1 block ${smallInput}`}
            inputMode="decimal"
            value={defaultPrice}
            disabled={busy}
            onChange={(e) => setDefaultPrice(e.target.value)}
            onBlur={() =>
              void action({
                action: 'update_item',
                itemId: item.id,
                defaultPricePence: poundsToPence(defaultPrice),
              })
            }
          />
        </label>
        <label className="text-xs text-slate-600">
          Default duration (min)
          <input
            className={`mt-1 block ${smallInput}`}
            inputMode="numeric"
            value={defaultDuration}
            disabled={busy}
            onChange={(e) => setDefaultDuration(e.target.value)}
            onBlur={() =>
              void action({
                action: 'update_item',
                itemId: item.id,
                defaultDurationMinutes:
                  defaultDuration.trim() === '' ? null : Math.max(0, Number(defaultDuration) || 0),
              })
            }
          />
        </label>
        <label className="text-xs text-slate-600">
          Price display
          <select
            className={`mt-1 block ${smallInput} w-36`}
            value={item.pricingDisplay}
            disabled={busy}
            onChange={(e) =>
              void action({ action: 'update_item', itemId: item.id, pricingDisplay: e.target.value })
            }
          >
            <option value="from">From (lowest)</option>
            <option value="fixed">Fixed</option>
            <option value="per_provider">Per provider</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={item.allowAnyAvailable}
            disabled={busy}
            onChange={(e) =>
              void action({
                action: 'update_item',
                itemId: item.id,
                allowAnyAvailable: e.target.checked,
              })
            }
          />
          Offer “any available”
        </label>
      </div>

      {/* Offering photo (Services tab) */}
      <label className="mt-3 block text-xs text-slate-600">
        Photo URL (shown on the Services tab)
        <input
          className={`mt-1 ${inputCls}`}
          placeholder="https://…"
          value={imageUrl}
          disabled={busy}
          onChange={(e) => setImageUrl(e.target.value)}
          onBlur={() => void action({ action: 'update_item', itemId: item.id, imageUrl })}
        />
      </label>

      {/* Providers */}
      <div className="mt-3 space-y-1.5">
        {item.providers.length === 0 ? (
          <p className="text-xs text-slate-400">No calendars provide this offering yet.</p>
        ) : (
          item.providers.map((p) => (
            <ProviderRow key={p.id} provider={p} busy={busy} action={action} />
          ))
        )}
      </div>

      <button
        type="button"
        className="mt-2 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
        disabled={busy}
        onClick={() => setAddOpen((o) => !o)}
      >
        {addOpen ? 'Cancel' : '+ Add a calendar'}
      </button>
      {addOpen ? (
        <AddProviderForm
          itemId={item.id}
          memberSources={memberSources}
          busy={busy}
          action={async (body) => {
            const ok = await action(body);
            if (ok) setAddOpen(false);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}

function approvalPill(status: CatalogueProviderView['approvalStatus']) {
  if (status === 'approved') return <Pill variant="success" size="sm">Approved</Pill>;
  if (status === 'rejected') return <Pill variant="neutral" size="sm">Declined</Pill>;
  return <Pill variant="warning" size="sm">Awaiting member</Pill>;
}

function ProviderRow({
  provider,
  busy,
  action,
}: {
  provider: CatalogueProviderView;
  busy: boolean;
  action: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
      <div className="min-w-0">
        <span className="text-slate-800">
          {provider.venueName}
          {provider.practitionerName ? ` · ${provider.practitionerName}` : ' · all practitioners'}
        </span>
        <span className="ml-2 text-xs text-slate-500">
          {provider.sourceServiceName ?? '—'} · {fmtPrice(provider.effectivePricePence)} ·{' '}
          {fmtDuration(provider.effectiveDurationMinutes)}
        </span>
        {!provider.sourceLive ? (
          <span className="ml-2 text-xs font-medium text-rose-600">source removed</span>
        ) : null}
        {provider.status === 'suspended' ? (
          <span className="ml-2 text-xs font-medium text-amber-600">suspended (link)</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {approvalPill(provider.approvalStatus)}
        <button
          type="button"
          className="text-xs font-medium text-rose-500 hover:text-rose-700 disabled:opacity-50"
          disabled={busy}
          onClick={() => void action({ action: 'remove_provider', providerId: provider.id })}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function AddProviderForm({
  itemId,
  memberSources,
  busy,
  action,
}: {
  itemId: string;
  memberSources: CatalogueMemberSource[];
  busy: boolean;
  action: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [venueId, setVenueId] = useState(memberSources[0]?.venueId ?? '');
  const member = memberSources.find((m) => m.venueId === venueId) ?? null;
  const [serviceId, setServiceId] = useState(member?.services[0]?.id ?? '');
  const [practitionerId, setPractitionerId] = useState<string>('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-slate-600">
          Venue
          <select
            className={`mt-1 block ${inputCls}`}
            value={venueId}
            disabled={busy}
            onChange={(e) => {
              setVenueId(e.target.value);
              const m = memberSources.find((x) => x.venueId === e.target.value);
              setServiceId(m?.services[0]?.id ?? '');
              setPractitionerId('');
            }}
          >
            {memberSources.map((m) => (
              <option key={m.venueId} value={m.venueId}>
                {m.venueName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Service
          <select
            className={`mt-1 block ${inputCls}`}
            value={serviceId}
            disabled={busy}
            onChange={(e) => setServiceId(e.target.value)}
          >
            {(member?.services ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Practitioner
          <select
            className={`mt-1 block ${inputCls}`}
            value={practitionerId}
            disabled={busy}
            onChange={(e) => setPractitionerId(e.target.value)}
          >
            <option value="">All practitioners</option>
            {(member?.practitioners ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="text-xs text-slate-600">
            Price (£)
            <input
              className={`mt-1 block ${smallInput}`}
              inputMode="decimal"
              placeholder="default"
              value={price}
              disabled={busy}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Duration
            <input
              className={`mt-1 block ${smallInput}`}
              inputMode="numeric"
              placeholder="default"
              value={duration}
              disabled={busy}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>
        </div>
      </div>
      <button
        type="button"
        className={btnSecondary}
        disabled={busy || !venueId || !serviceId}
        onClick={() =>
          void action({
            action: 'add_provider',
            itemId,
            venueId,
            sourceServiceId: serviceId,
            practitionerId: practitionerId || null,
            pricePenceOverride: poundsToPence(price),
            durationMinutesOverride: duration.trim() === '' ? null : Math.max(1, Number(duration) || 0),
          })
        }
      >
        Add calendar
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member console (consent + solo page)
// ---------------------------------------------------------------------------

function MemberConsole({
  catalogue,
  collective,
  busy,
  action,
  onSolo,
}: {
  catalogue: CatalogueManagementView;
  collective: CollectiveView;
  busy: boolean;
  action: (body: Record<string, unknown>) => Promise<boolean>;
  onSolo: (behavior: 'keep_live' | 'redirect') => void;
}) {
  const myVenueId = collective.myVenueId;
  const mine = catalogue.items
    .filter((i) => i.status === 'active')
    .flatMap((i) =>
      i.providers
        .filter((p) => p.venueId === myVenueId && p.status !== 'removed')
        .map((p) => ({ item: i, provider: p })),
    );
  const soloRedirect = collective.myConfig?.soloPageBehavior === 'redirect';

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-bold text-slate-900">Your own booking page</p>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            className="mt-0.5"
            name="solo"
            disabled={busy}
            checked={!soloRedirect}
            onChange={() => onSolo('keep_live')}
          />
          Keep my own booking page live alongside the combined page
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            className="mt-0.5"
            name="solo"
            disabled={busy}
            checked={soloRedirect}
            onChange={() => onSolo('redirect')}
          />
          Redirect my booking page to the combined page
        </label>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-bold text-slate-900">Offerings using your calendars</p>
        {mine.length === 0 ? (
          <p className="text-sm text-slate-500">
            The host hasn’t added any of your calendars to the combined catalogue yet.
          </p>
        ) : (
          mine.map(({ item, provider }) => (
            <MemberProviderRow
              key={provider.id}
              itemName={item.name}
              provider={provider}
              busy={busy}
              action={action}
            />
          ))
        )}
      </section>
    </div>
  );
}

function MemberProviderRow({
  itemName,
  provider,
  busy,
  action,
}: {
  itemName: string;
  provider: CatalogueProviderView;
  busy: boolean;
  action: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [adjust, setAdjust] = useState(false);
  const [price, setPrice] = useState(
    provider.pricePenceOverride == null ? '' : (provider.pricePenceOverride / 100).toFixed(2),
  );
  const [duration, setDuration] = useState(
    provider.durationMinutesOverride == null ? '' : String(provider.durationMinutesOverride),
  );

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{itemName}</p>
          <p className="text-xs text-slate-500">
            {provider.practitionerName ?? 'All practitioners'} · proposed{' '}
            {fmtPrice(provider.effectivePricePence)} · {fmtDuration(provider.effectiveDurationMinutes)}
          </p>
        </div>
        {approvalPill(provider.approvalStatus)}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {provider.approvalStatus !== 'approved' ? (
          <button
            type="button"
            className={btnPrimary}
            disabled={busy}
            onClick={() => void action({ action: 'approve_provider', providerId: provider.id })}
          >
            Approve these terms
          </button>
        ) : null}
        <button
          type="button"
          className={btnSecondary}
          disabled={busy}
          onClick={() => setAdjust((o) => !o)}
        >
          {adjust ? 'Cancel' : 'Adjust price / duration'}
        </button>
        {provider.approvalStatus !== 'rejected' ? (
          <button
            type="button"
            className={btnDanger}
            disabled={busy}
            onClick={() => void action({ action: 'reject_provider', providerId: provider.id })}
          >
            Don’t offer this
          </button>
        ) : null}
      </div>
      {adjust ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">
            Your price (£)
            <input
              className={`mt-1 block ${smallInput}`}
              inputMode="decimal"
              value={price}
              disabled={busy}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Your duration (min)
            <input
              className={`mt-1 block ${smallInput}`}
              inputMode="numeric"
              value={duration}
              disabled={busy}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={btnSecondary}
            disabled={busy}
            onClick={async () => {
              const ok = await action({
                action: 'set_provider_terms',
                providerId: provider.id,
                pricePenceOverride: poundsToPence(price),
                durationMinutesOverride:
                  duration.trim() === '' ? null : Math.max(1, Number(duration) || 0),
              });
              if (ok) setAdjust(false);
            }}
          >
            Save &amp; approve
          </button>
        </div>
      ) : null}
    </div>
  );
}
