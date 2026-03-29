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

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ClassTimetableView({ venueId: _venueId, isAdmin: _isAdmin }: { venueId: string; isAdmin: boolean }) {
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [instances, setInstances] = useState<ClassInstance[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { fetchData(); }, [fetchData]);

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
          {/* Weekly timetable grid */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {DAY_LABELS.map((day, i) => (
                    <th key={i} className="px-4 py-3 text-left font-medium text-slate-600">{day}</th>
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
                      <td key={dow} className="align-top px-3 py-3 border-r border-slate-50 last:border-r-0">
                        <div className="space-y-2 min-h-[80px]">
                          {entries.map((entry) => {
                            const ct = typeMap.get(entry.class_type_id);
                            return (
                              <div
                                key={entry.id}
                                className="rounded-lg px-3 py-2 text-xs"
                                style={{ backgroundColor: ct?.colour ? `${ct.colour}20` : '#f1f5f9', borderLeft: `3px solid ${ct?.colour ?? '#94a3b8'}` }}
                              >
                                <div className="font-medium" style={{ color: ct?.colour ?? '#475569' }}>
                                  {ct?.name ?? 'Unknown'}
                                </div>
                                <div className="text-slate-500">{entry.start_time.slice(0, 5)}</div>
                              </div>
                            );
                          })}
                          {entries.length === 0 && (
                            <div className="text-xs text-slate-300">—</div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Upcoming instances */}
          {instances.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-slate-700">Upcoming Instances</h2>
              <div className="space-y-2">
                {instances.slice(0, 20).map((inst) => {
                  const ct = typeMap.get(inst.class_type_id);
                  return (
                    <div key={inst.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ct?.colour ?? '#94a3b8' }} />
                        <span className="font-medium text-slate-900">{ct?.name}</span>
                        <span className="text-slate-500">{inst.instance_date} at {inst.start_time.slice(0, 5)}</span>
                      </div>
                      {inst.is_cancelled && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Cancelled</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
