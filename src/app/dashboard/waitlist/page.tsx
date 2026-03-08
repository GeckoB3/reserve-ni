'use client';

import { useEffect, useState } from 'react';

interface WaitlistEntry {
  id: string;
  desired_date: string;
  desired_time: string | null;
  party_size: number;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string;
  status: 'waiting' | 'offered' | 'confirmed' | 'expired' | 'cancelled';
  offered_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<WaitlistEntry['status'], string> = {
  waiting: 'bg-blue-100 text-blue-700',
  offered: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  expired: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-red-100 text-red-700',
};

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/venue/waitlist');
        if (res.ok) {
          const data = await res.json();
          setEntries(data.entries ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleOffer(entry: WaitlistEntry) {
    try {
      const res = await fetch('/api/venue/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, status: 'offered' }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(entries.map((e) => (e.id === entry.id ? data.entry : e)));
      }
    } catch {
      // handled silently
    }
  }

  async function handleConfirm(entry: WaitlistEntry) {
    try {
      const res = await fetch('/api/venue/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, status: 'confirmed' }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(entries.map((e) => (e.id === entry.id ? data.entry : e)));
      }
    } catch {
      // handled silently
    }
  }

  async function handleCancel(entry: WaitlistEntry) {
    try {
      const res = await fetch('/api/venue/waitlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, status: 'cancelled' }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(entries.map((e) => (e.id === entry.id ? data.entry : e)));
      }
    } catch {
      // handled silently
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this entry permanently?')) return;
    try {
      await fetch('/api/venue/waitlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setEntries(entries.filter((e) => e.id !== id));
    } catch {
      // handled silently
    }
  }

  const filteredEntries = filter === 'active'
    ? entries.filter((e) => e.status === 'waiting' || e.status === 'offered')
    : entries;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Waitlist</h1>
          <p className="text-sm text-slate-500">Manage standby requests from guests.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          <button
            onClick={() => setFilter('active')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
          >
            All
          </button>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-12 text-center">
          <svg className="mb-3 h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
          <p className="text-sm text-slate-500">No waitlist entries {filter === 'active' ? 'currently active' : 'found'}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{entry.guest_name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[entry.status]}`}>
                      {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    <span>{entry.desired_date}</span>
                    {entry.desired_time && <span>{entry.desired_time.slice(0, 5)}</span>}
                    <span>{entry.party_size} {entry.party_size === 1 ? 'guest' : 'guests'}</span>
                    <span>{entry.guest_phone}</span>
                    {entry.guest_email && <span>{entry.guest_email}</span>}
                  </div>
                  {entry.notes && <p className="mt-1 text-xs text-slate-400">{entry.notes}</p>}
                  {entry.expires_at && entry.status === 'offered' && (
                    <p className="mt-1 text-xs text-amber-600">
                      Expires: {new Date(entry.expires_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  {entry.status === 'waiting' && (
                    <button onClick={() => handleOffer(entry)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                      Offer Spot
                    </button>
                  )}
                  {entry.status === 'offered' && (
                    <button onClick={() => handleConfirm(entry)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                      Confirm
                    </button>
                  )}
                  {(entry.status === 'waiting' || entry.status === 'offered') && (
                    <button onClick={() => handleCancel(entry)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50">
                      Cancel
                    </button>
                  )}
                  {(entry.status === 'expired' || entry.status === 'cancelled') && (
                    <button onClick={() => handleDelete(entry.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
