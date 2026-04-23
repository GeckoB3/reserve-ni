'use client';

import { useCallback, useEffect, useState } from 'react';

interface StaffRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  created_at: string;
}

interface VenueRow {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  pricing_tier: string;
  plan_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_current_period_end: string | null;
  booking_model: string;
  created_at: string;
  onboarding_completed: boolean;
  staff: StaffRow[];
}

interface ApiResponse {
  venues: VenueRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const TIER_OPTIONS = ['', 'appointments', 'plus', 'light', 'restaurant', 'founding'] as const;
const STATUS_OPTIONS = ['', 'active', 'trialing', 'past_due', 'cancelled', 'cancelling'] as const;

function tierBadge(tier: string) {
  const t = tier.toLowerCase().trim();
  if (t === 'appointments') return 'bg-violet-100 text-violet-700';
  if (t === 'plus') return 'bg-indigo-100 text-indigo-800';
  if (t === 'light') return 'bg-sky-100 text-sky-800';
  if (t === 'restaurant') return 'bg-blue-100 text-blue-700';
  if (t === 'founding') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-600';
}

function statusBadge(status: string) {
  const s = status.toLowerCase().trim();
  if (s === 'active') return 'bg-emerald-100 text-emerald-700';
  if (s === 'trialing') return 'bg-cyan-100 text-cyan-700';
  if (s === 'past_due') return 'bg-red-100 text-red-700';
  if (s === 'cancelled') return 'bg-slate-200 text-slate-500';
  if (s === 'cancelling') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

function roleBadge(role: string) {
  return role === 'admin'
    ? 'bg-indigo-100 text-indigo-700'
    : 'bg-slate-100 text-slate-600';
}

export function VenuesTable() {
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [status, setStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchVenues = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (search) params.set('search', search);
      if (tier) params.set('tier', tier);
      if (status) params.set('status', status);

      const res = await fetch(`/api/platform/venues?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: ApiResponse = await res.json();

      setVenues(data.venues);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error('Error fetching venues:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, tier, status]);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  useEffect(() => {
    setPage(1);
  }, [search, tier, status]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Search venues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          {TIER_OPTIONS.map((t) => (
            <option key={t} value={t}>{t ? t.charAt(0).toUpperCase() + t.slice(1) : 'All tiers'}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ') : 'All statuses'}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-400">
          {total} venue{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-medium uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3 w-8" />
              <th className="px-4 py-3">Venue</th>
              <th className="px-4 py-3 hidden md:table-cell">Plan</th>
              <th className="px-4 py-3 hidden md:table-cell">Status</th>
              <th className="px-4 py-3 hidden lg:table-cell">Model</th>
              <th className="px-4 py-3 hidden lg:table-cell">Staff</th>
              <th className="px-4 py-3 hidden xl:table-cell">Created</th>
              <th className="px-4 py-3 hidden xl:table-cell">Stripe Sub</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && venues.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="px-4 py-4">
                    <div className="h-5 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : venues.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  No venues found.
                </td>
              </tr>
            ) : (
              venues.map((venue) => {
                const expanded = expandedId === venue.id;
                return (
                  <VenueRowGroup
                    key={venue.id}
                    venue={venue}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : venue.id)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function VenueRowGroup({
  venue,
  expanded,
  onToggle,
}: {
  venue: VenueRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const staffCount = venue.staff?.length ?? 0;
  const created = new Date(venue.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const stripeSubShort = venue.stripe_subscription_id
    ? `...${venue.stripe_subscription_id.slice(-8)}`
    : '--';

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors hover:bg-slate-50 ${expanded ? 'bg-slate-50' : ''}`}
      >
        <td className="px-4 py-3">
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </td>
        <td className="px-4 py-3">
          <p className="font-medium text-slate-900">{venue.name}</p>
          <p className="text-xs text-slate-400">{venue.slug}</p>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tierBadge(venue.pricing_tier)}`}>
            {venue.pricing_tier}
          </span>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(venue.plan_status)}`}>
            {venue.plan_status}
          </span>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-600">
          {venue.booking_model?.replace(/_/g, ' ')}
        </td>
        <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-600">
          {staffCount}
        </td>
        <td className="px-4 py-3 hidden xl:table-cell text-xs text-slate-500">
          {created}
        </td>
        <td className="px-4 py-3 hidden xl:table-cell">
          {venue.stripe_subscription_id ? (
            <a
              href={`https://dashboard.stripe.com/subscriptions/${venue.stripe_subscription_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-blue-600 hover:underline"
            >
              {stripeSubShort}
            </a>
          ) : (
            <span className="text-xs text-slate-400">--</span>
          )}
        </td>
      </tr>

      {/* Expanded staff detail */}
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-slate-50 px-4 py-0">
            <div className="py-4 pl-8">
              <div className="mb-3 flex items-center gap-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Staff ({staffCount})
                </h4>
                {venue.email && (
                  <span className="text-xs text-slate-400">
                    Contact: {venue.email}
                  </span>
                )}
                {venue.subscription_current_period_end && (
                  <span className="text-xs text-slate-400">
                    Period ends: {new Date(venue.subscription_current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>

              {/* Mobile tier/status badges */}
              <div className="mb-3 flex flex-wrap gap-2 md:hidden">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tierBadge(venue.pricing_tier)}`}>
                  {venue.pricing_tier}
                </span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(venue.plan_status)}`}>
                  {venue.plan_status}
                </span>
              </div>

              {staffCount === 0 ? (
                <p className="text-xs text-slate-400 italic">No staff members.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2 hidden sm:table-cell">Phone</th>
                        <th className="px-3 py-2">Role</th>
                        <th className="px-3 py-2 hidden sm:table-cell">Added</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {venue.staff.map((s) => (
                        <tr key={s.id}>
                          <td className="px-3 py-2 text-slate-700">{s.name ?? '--'}</td>
                          <td className="px-3 py-2 text-slate-600">{s.email}</td>
                          <td className="px-3 py-2 text-slate-600 hidden sm:table-cell">{s.phone ?? '--'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${roleBadge(s.role)}`}>
                              {s.role}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500 hidden sm:table-cell">
                            {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
