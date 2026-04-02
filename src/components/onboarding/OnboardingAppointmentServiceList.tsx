'use client';

export type StaffMayFlags = {
  name: boolean;
  description: boolean;
  duration: boolean;
  buffer: boolean;
  price: boolean;
  deposit: boolean;
  colour: boolean;
};

export const DEFAULT_STAFF_MAY: StaffMayFlags = {
  name: false,
  description: false,
  duration: false,
  buffer: false,
  price: false,
  deposit: false,
  colour: false,
};

export interface AppointmentServiceFormDraft {
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  price: string;
  deposit: string;
  require_deposit: boolean;
  colour: string;
  is_active: boolean;
  practitioner_ids: string[];
  staffMay: StaffMayFlags;
}

const COLOUR_OPTIONS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

function poundsToPence(pounds: string): number | null {
  const trimmed = pounds.trim();
  if (!trimmed) return null;
  const num = parseFloat(trimmed);
  if (Number.isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

export function createEmptyAppointmentServiceDraft(): AppointmentServiceFormDraft {
  return {
    name: '',
    description: '',
    duration_minutes: 30,
    buffer_minutes: 0,
    price: '',
    deposit: '',
    require_deposit: false,
    colour: '#3B82F6',
    is_active: true,
    practitioner_ids: [],
    staffMay: { ...DEFAULT_STAFF_MAY },
  };
}

export function appointmentServiceDraftFromBusinessDefault(ds: {
  name: string;
  duration: number;
  price: number;
}): AppointmentServiceFormDraft {
  return {
    name: ds.name,
    description: '',
    duration_minutes: ds.duration,
    buffer_minutes: 0,
    price: (ds.price / 100).toFixed(2),
    deposit: '',
    require_deposit: false,
    colour: '#3B82F6',
    is_active: true,
    practitioner_ids: [],
    staffMay: { ...DEFAULT_STAFF_MAY },
  };
}

/** Build JSON body for POST /api/venue/appointment-services */
export function serviceDraftToApiPayload(draft: AppointmentServiceFormDraft): Record<string, unknown> {
  const depositPence = draft.require_deposit ? (poundsToPence(draft.deposit) ?? 0) : 0;
  const ids = draft.practitioner_ids;
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    duration_minutes: draft.duration_minutes,
    buffer_minutes: draft.buffer_minutes,
    price_pence: poundsToPence(draft.price) ?? undefined,
    deposit_pence: depositPence,
    colour: draft.colour,
    is_active: draft.is_active,
    practitioner_ids: ids,
    staff_may_customize_name: draft.staffMay.name,
    staff_may_customize_description: draft.staffMay.description,
    staff_may_customize_duration: draft.staffMay.duration,
    staff_may_customize_buffer: draft.staffMay.buffer,
    staff_may_customize_price: draft.staffMay.price,
    staff_may_customize_deposit: draft.staffMay.deposit,
    staff_may_customize_colour: draft.staffMay.colour,
  };
}

interface OnboardingAppointmentServiceListProps {
  currencySymbol: string;
  terms: { client: string; staff: string };
  services: AppointmentServiceFormDraft[];
  setServices: React.Dispatch<React.SetStateAction<AppointmentServiceFormDraft[]>>;
  roster: Array<{ id: string; name: string }>;
  /** When roster loads, merge into drafts that still have empty practitioner_ids */
  rosterIds: string[];
}

export function OnboardingAppointmentServiceList({
  currencySymbol,
  terms,
  services,
  setServices,
  roster,
  rosterIds,
}: OnboardingAppointmentServiceListProps) {
  const sym = currencySymbol;

  function togglePractitioner(svcIndex: number, pid: string) {
    setServices((prev) => {
      const copy = [...prev];
      const row = copy[svcIndex];
      if (!row) return prev;
      const nextIds = row.practitioner_ids.includes(pid)
        ? row.practitioner_ids.filter((id) => id !== pid)
        : [...row.practitioner_ids, pid];
      copy[svcIndex] = { ...row, practitioner_ids: nextIds };
      return copy;
    });
  }

  return (
    <div className="space-y-4">
      {services.map((s, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Service {i + 1}</span>
            {services.length > 1 && (
              <button
                type="button"
                onClick={() => setServices(services.filter((_, j) => j !== i))}
                className="text-xs font-medium text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Name *</label>
            <input
              type="text"
              value={s.name}
              onChange={(e) => {
                const v = e.target.value;
                setServices((prev) => {
                  const c = [...prev];
                  c[i] = { ...c[i]!, name: v };
                  return c;
                });
              }}
              placeholder="e.g. Cut & colour"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
            <textarea
              value={s.description}
              onChange={(e) => {
                const v = e.target.value;
                setServices((prev) => {
                  const c = [...prev];
                  c[i] = { ...c[i]!, description: v };
                  return c;
                });
              }}
              rows={2}
              placeholder="Brief description for clients"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Duration (mins) *</label>
              <input
                type="number"
                value={s.duration_minutes}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10) || 0;
                  setServices((prev) => {
                    const c = [...prev];
                    c[i] = { ...c[i]!, duration_minutes: n };
                    return c;
                  });
                }}
                min={5}
                max={480}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Buffer (mins)</label>
              <input
                type="number"
                value={s.buffer_minutes}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10) || 0;
                  setServices((prev) => {
                    const c = [...prev];
                    c[i] = { ...c[i]!, buffer_minutes: n };
                    return c;
                  });
                }}
                min={0}
                max={120}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Price ({sym})</label>
            <div className="relative max-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{sym}</span>
              <input
                type="text"
                inputMode="decimal"
                value={s.price}
                onChange={(e) => {
                  const v = e.target.value;
                  setServices((prev) => {
                    const c = [...prev];
                    c[i] = { ...c[i]!, price: v };
                    return c;
                  });
                }}
                className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-sm"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setServices((prev) => {
                    const c = [...prev];
                    c[i] = { ...c[i]!, require_deposit: !c[i]!.require_deposit };
                    return c;
                  });
                }}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  s.require_deposit ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    s.require_deposit ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-slate-700">Require deposit for this service</span>
            </div>
            {s.require_deposit && (
              <div>
                <label className="mb-1 block text-sm text-slate-600">Deposit amount ({sym})</label>
                <div className="relative max-w-[200px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{sym}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={s.deposit}
                    onChange={(e) => {
                      const v = e.target.value;
                      setServices((prev) => {
                        const c = [...prev];
                        c[i] = { ...c[i]!, deposit: v };
                        return c;
                      });
                    }}
                    className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-sm"
                    placeholder="5.00"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Colour</label>
            <div className="flex flex-wrap gap-2">
              {COLOUR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setServices((prev) => {
                      const copy = [...prev];
                      copy[i] = { ...copy[i]!, colour: c };
                      return copy;
                    });
                  }}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${
                    s.colour === c ? 'border-slate-900 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setServices((prev) => {
                  const c = [...prev];
                  c[i] = { ...c[i]!, is_active: !c[i]!.is_active };
                  return c;
                });
              }}
              className={`relative h-6 w-11 rounded-full transition-colors ${s.is_active ? 'bg-blue-600' : 'bg-slate-300'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  s.is_active ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-slate-700">Active (visible to clients)</span>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-800">{terms.staff} can customise (their calendar only)</p>
            <p className="text-xs text-slate-500">
              When ticked, linked {terms.staff.toLowerCase()} can set their own value for that field on their calendar.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ['name', 'Display name'],
                  ['description', 'Description'],
                  ['duration', 'Duration'],
                  ['buffer', 'Buffer time'],
                  ['price', 'Price'],
                  ['deposit', 'Deposit'],
                  ['colour', 'Colour'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={s.staffMay[key]}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setServices((prev) => {
                        const c = [...prev];
                        c[i] = { ...c[i]!, staffMay: { ...c[i]!.staffMay, [key]: checked } };
                        return c;
                      });
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {roster.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {terms.staff} who offer this service
              </label>
              <p className="mb-2 text-xs text-slate-500">
                All {terms.staff.toLowerCase()} are selected by default. Untick anyone who does not offer this service.
              </p>
              <div className="space-y-2">
                {roster.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={s.practitioner_ids.includes(p.id)}
                      onChange={() => togglePractitioner(i, p.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span className="text-sm text-slate-700">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          setServices((prev) => [
            ...prev,
            {
              ...createEmptyAppointmentServiceDraft(),
              practitioner_ids: rosterIds.length > 0 ? [...rosterIds] : [],
            },
          ])
        }
        className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm text-slate-500 hover:border-brand-300 hover:text-brand-600"
      >
        + Add service
      </button>
    </div>
  );
}
