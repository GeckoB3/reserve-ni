import { getSupabaseAdminClient } from '@/lib/supabase';

interface KpiData {
  totalVenues: number;
  activeVenues: number;
  totalStaff: number;
  byTier: { appointments: number; restaurant: number; founding: number };
}

async function fetchKpis(): Promise<KpiData> {
  const admin = getSupabaseAdminClient();

  const [venuesResult, staffResult] = await Promise.all([
    admin.from('venues').select('id, pricing_tier, plan_status'),
    admin.from('staff').select('id', { count: 'exact', head: true }),
  ]);

  const venues = venuesResult.data ?? [];
  const totalStaff = staffResult.count ?? 0;

  let activeVenues = 0;
  let appointments = 0;
  let restaurant = 0;
  let founding = 0;

  for (const v of venues) {
    const tier = ((v.pricing_tier as string) ?? '').toLowerCase().trim();
    const status = ((v.plan_status as string) ?? '').toLowerCase().trim();

    if (status === 'active' || status === 'trialing') activeVenues++;
    if (tier === 'appointments') appointments++;
    else if (tier === 'restaurant') restaurant++;
    else if (tier === 'founding') founding++;
  }

  return {
    totalVenues: venues.length,
    activeVenues,
    totalStaff,
    byTier: { appointments, restaurant, founding },
  };
}

export async function KpiCards() {
  const data = await fetchKpis();

  const cards = [
    { label: 'Total Venues', value: data.totalVenues, color: 'bg-blue-50 text-blue-700' },
    { label: 'Active Subscriptions', value: data.activeVenues, color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Appointments Plan', value: data.byTier.appointments, color: 'bg-violet-50 text-violet-700' },
    { label: 'Restaurant / Founding', value: data.byTier.restaurant + data.byTier.founding, color: 'bg-amber-50 text-amber-700' },
    { label: 'Total Staff Logins', value: data.totalStaff, color: 'bg-slate-100 text-slate-700' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-slate-200 bg-white p-5"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            {c.label}
          </p>
          <p className={`mt-2 text-2xl font-bold ${c.color.split(' ')[1]}`}>
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
