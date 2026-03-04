'use client';

import { useCallback, useState } from 'react';
import type { VenueSettings } from '../types';

const TEMPLATE_TYPES = [
  { key: 'booking_confirmation', label: 'Booking confirmation', channels: 'Email' },
  { key: 'deposit_payment_request', label: 'Deposit payment request', channels: 'Email + SMS' },
  { key: 'pre_visit_reminder', label: 'Pre-visit reminder (48h)', channels: 'Email' },
  { key: 'confirm_or_cancel_prompt', label: 'Confirm or cancel (24h)', channels: 'SMS' },
  { key: 'post_visit_thankyou', label: 'Post-visit thank you', channels: 'Email' },
  { key: 'booking_modification', label: 'Booking modification', channels: 'Email' },
  { key: 'cancellation_confirmation', label: 'Cancellation confirmation', channels: 'Email' },
  { key: 'no_show_notification', label: 'No-show notification', channels: 'Email' },
] as const;

interface CommunicationTemplatesSectionProps {
  venue: VenueSettings;
  onUpdate: (patch: Partial<VenueSettings>) => void;
  isAdmin: boolean;
}

export function CommunicationTemplatesSection({ venue, onUpdate, isAdmin }: CommunicationTemplatesSectionProps) {
  const [templates, setTemplates] = useState<Record<string, { subject?: string; body?: string }>>(
    venue.communication_templates ?? {}
  );
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/venue/communication-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communication_templates: templates }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to save');
      }
      const { communication_templates } = await res.json();
      onUpdate({ communication_templates });
      setEditingKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [templates, onUpdate]);

  const updateTemplate = useCallback((key: string, field: 'subject' | 'body', value: string) => {
    setTemplates((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value || undefined },
    }));
  }, []);

  const clearTemplate = useCallback((key: string) => {
    setTemplates((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-neutral-900">Communication templates</h2>
      <p className="mb-4 text-sm text-neutral-600">
        Customise the wording of guest communications. Leave blank to use the default template.
        Use <code className="rounded bg-neutral-100 px-1">{'{{variable}}'}</code> placeholders (e.g. {'{{guest_name}}'}, {'{{venue_name}}'}).
      </p>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</div>
      )}

      <div className="space-y-3">
        {TEMPLATE_TYPES.map((t) => {
          const isEditing = editingKey === t.key;
          const hasOverride = templates[t.key] && (templates[t.key].subject || templates[t.key].body);

          return (
            <div key={t.key} className="rounded border border-neutral-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-neutral-900">{t.label}</span>
                  <span className="ml-2 text-xs text-neutral-500">{t.channels}</span>
                  {hasOverride && <span className="ml-2 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">customised</span>}
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingKey(isEditing ? null : t.key)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {isEditing ? 'Collapse' : 'Edit'}
                    </button>
                    {hasOverride && (
                      <button
                        type="button"
                        onClick={() => clearTemplate(t.key)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isEditing && isAdmin && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Subject (email only)</label>
                    <input
                      type="text"
                      value={templates[t.key]?.subject ?? ''}
                      onChange={(e) => updateTemplate(t.key, 'subject', e.target.value)}
                      placeholder="Leave blank for default"
                      className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Body</label>
                    <textarea
                      value={templates[t.key]?.body ?? ''}
                      onChange={(e) => updateTemplate(t.key, 'body', e.target.value)}
                      rows={4}
                      placeholder="Leave blank for default"
                      className="w-full rounded border border-neutral-300 px-3 py-1.5 text-sm font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-4 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save templates'}
        </button>
      )}
    </section>
  );
}
