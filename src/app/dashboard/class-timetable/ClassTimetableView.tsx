'use client';

import { useCallback, useEffect, useState } from 'react';

interface ClassType {
  id: string;
  name: string;
  duration_minutes: number;
  capacity: number;
  price_pence: number | null;
  colour: string;
  is_active: boolean;
}

interface TimetableEntry {
  id: string;
  class_type_id: string;
  day_of_week: number;
  start_time: string;
  is_active: boolean;
}

interface ClassInstance {
  id: string;
  class_type_id: string;
  instance_date: string;
  start_time: string;
  is_cancelled: boolean;
  cancel_reason: string | null;
}

interface ClassTypeDetail {
  id: string;
  name: string;
  duration_minutes: number;
  capacity: number;
  price_pence: number | null;
  colour: string;
}

interface InstanceDetail extends ClassInstance {
  class_type: ClassTypeDetail;
}

interface AttendeeRow {
  booking_id: string;
  status: string;
  party_size: number;
  deposit_amount_pence: number | null;
  deposit_status: string | null;
  booking_date: string;
  booking_time: string;
  checked_in_at: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function escapeCsvCell(s: string | number | null | undefined): string {
  if (s == null || s === '') return '';
  const str = String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function ClassTimetableView({
  venueId: _venueId,
  isAdmin,
  currency = 'GBP',
}: {
  venueId: string;
  isAdmin: boolean;
  currency?: string;
}) {
  const sym = currency === 'EUR' ? '€' : '£';
  function formatPrice(pence: number): string {
    return `${sym}${(pence / 100).toFixed(2)}`;
  }

  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/venue/classes');
      const data = await res.json();
      setClassTypes(data.class_types ?? []);
      setTimetable(data.timetable ?? []);
      setInstances(data.instances ?? []);
    } catch {
      console.error('Failed to load class data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const [instRes, attRes] = await Promise.all([
        fetch(`/api/venue/class-instances/${id}`),
        fetch(`/api/venue/class-instances/${id}/attendees`),
      ]);
      const instJson = await instRes.json();
      const attJson = await attRes.json();
      if (!instRes.ok) {
        setDetailError(instJson.error ?? 'Failed to load instance');
        setDetail(null);
        setAttendees([]);
        return;
      }
      if (!attRes.ok) {
        setDetailError(attJson.error ?? 'Failed to load roster');
        setDetail(instJson as InstanceDetail);
        setAttendees([]);
        return;
      }
      setDetail(instJson as InstanceDetail);
      setAttendees((attJson.attendees ?? []) as AttendeeRow[]);
    } catch {
      setDetailError('Failed to load instance');
      setDetail(null);
      setAttendees([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setAttendees([]);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const handleCancelInstance = async () => {
    if (!selectedId || !detail) return;
    const ok = window.confirm(
      `Cancel this "${detail.class_type.name}" class on ${detail.instance_date}? Enrolled guests will be notified and refunds follow your policy.`,
    );
    if (!ok) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/venue/class-instances/${selectedId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? 'Could not cancel class');
        return;
      }
      setSelectedId(null);
      await fetchData();
    } catch {
      window.alert('Could not cancel class');
    } finally {
      setCancelLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!detail || attendees.length === 0) return;
    const headers = ['Guest name', 'Email', 'Phone', 'Party size', 'Status', 'Deposit (pence)', 'Deposit status', 'Checked in'];
    const lines = [
      headers.join(','),
      ...attendees.map((a) =>
        [
          escapeCsvCell(a.guest_name),
          escapeCsvCell(a.guest_email),
          escapeCsvCell(a.guest_phone),
          escapeCsvCell(a.party_size),
          escapeCsvCell(a.status),
          escapeCsvCell(a.deposit_amount_pence),
          escapeCsvCell(a.deposit_status),
          escapeCsvCell(a.checked_in_at ? new Date(a.checked_in_at).toISOString() : ''),
        ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `class-roster-${detail.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const typeMap = new Map(classTypes.map((ct) => [ct.id, ct]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Class Timetable</h1>
      </div>

      {loading ? (
        <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
      ) : classTypes.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-500">No class types configured yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {DAY_LABELS.map((day, i) => (
                    <th key={i} className="px-4 py-3 text-left font-medium text-slate-600">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {DAY_LABELS.map((_, dow) => {
                    const entries = timetable
                      .filter((e) => e.day_of_week === dow && e.is_active)
                      .sort((a, b) => a.start_time.localeCompare(b.start_time));
                    return (
                      <td key={dow} className="align-top border-r border-slate-50 px-3 py-3 last:border-r-0">
                        <div className="min-h-[80px] space-y-2">
                          {entries.map((entry) => {
                            const ct = typeMap.get(entry.class_type_id);
                            return (
                              <div
                                key={entry.id}
                                className="rounded-lg px-3 py-2 text-xs"
                                style={{
                                  backgroundColor: ct?.colour ? `${ct.colour}20` : '#f1f5f9',
                                  borderLeft: `3px solid ${ct?.colour ?? '#94a3b8'}`,
                                }}
                              >
                                <div className="font-medium" style={{ color: ct?.colour ?? '#475569' }}>
                                  {ct?.name ?? 'Unknown'}
                                </div>
                                <div className="text-slate-500">{entry.start_time.slice(0, 5)}</div>
                              </div>
                            );
                          })}
                          {entries.length === 0 && <div className="text-xs text-slate-300">—</div>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {instances.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-slate-700">Upcoming Instances</h2>
              <div className="space-y-2">
                {instances.slice(0, 50).map((inst) => {
                  const ct = typeMap.get(inst.class_type_id);
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => setSelectedId(selectedId === inst.id ? null : inst.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm shadow-sm transition-colors ${
                        selectedId === inst.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ct?.colour ?? '#94a3b8' }} />
                        <span className="font-medium text-slate-900">{ct?.name}</span>
                        <span className="text-slate-500">
                          {inst.instance_date} at {inst.start_time.slice(0, 5)}
                        </span>
                      </div>
                      {inst.is_cancelled && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Cancelled</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {selectedId && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {detailLoading && <p className="text-sm text-slate-500">Loading roster…</p>}
          {detailError && <p className="text-sm text-red-600">{detailError}</p>}
          {!detailLoading && detail && (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{detail.class_type.name}</h3>
                  <p className="text-sm text-slate-500">
                    {detail.instance_date} · {String(detail.start_time).slice(0, 5)} · {detail.class_type.duration_minutes}{' '}
                    min · capacity {detail.class_type.capacity}
                  </p>
                  {detail.is_cancelled && (
                    <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Cancelled
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {attendees.length > 0 && (
                    <button
                      type="button"
                      onClick={downloadCsv}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Download CSV
                    </button>
                  )}
                  {isAdmin && !detail.is_cancelled && (
                    <button
                      type="button"
                      onClick={() => void handleCancelInstance()}
                      disabled={cancelLoading}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                    >
                      {cancelLoading ? 'Cancelling…' : 'Cancel class & notify guests'}
                    </button>
                  )}
                </div>
              </div>

              <h4 className="mb-2 text-sm font-medium text-slate-700">Roster</h4>
              {attendees.length === 0 ? (
                <p className="text-sm text-slate-500">No bookings for this instance.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Guest</th>
                        <th className="py-2 pr-3 font-medium">Contact</th>
                        <th className="py-2 pr-3 font-medium">Qty</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Deposit</th>
                        <th className="py-2 font-medium">Checked in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendees.map((a) => (
                        <tr key={a.booking_id} className="border-b border-slate-100">
                          <td className="py-2 pr-3 text-slate-800">{a.guest_name ?? '—'}</td>
                          <td className="py-2 pr-3 text-slate-600">
                            <div className="max-w-[200px] truncate">{a.guest_email ?? '—'}</div>
                            <div className="text-xs text-slate-500">{a.guest_phone ?? ''}</div>
                          </td>
                          <td className="py-2 pr-3">{a.party_size}</td>
                          <td className="py-2 pr-3">{a.status}</td>
                          <td className="py-2 pr-3">
                            {a.deposit_amount_pence != null ? formatPrice(a.deposit_amount_pence) : '—'}
                            {a.deposit_status ? (
                              <span className="ml-1 text-xs text-slate-500">({a.deposit_status})</span>
                            ) : null}
                          </td>
                          <td className="py-2 text-slate-600">
                            {a.checked_in_at ? new Date(a.checked_in_at).toLocaleString('en-GB') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
