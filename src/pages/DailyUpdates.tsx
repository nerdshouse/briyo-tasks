/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, NotebookPen, Lock, Search, Users, BellRing, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { DailyUpdate, DailyUpdateItem, DailyUpdateReminderResult, User } from '../types';
import { getTodayIST } from '../lib/dates';
import { canManageMembers } from '../lib/permissions';
import { Button } from '../components/ui/Button';
import { DateInput } from '../components/ui/DateInput';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';

const cardCls = 'bg-white rounded-card border border-slate-200 shadow-card';

/** How many days back (including today) a user can still edit their log. */
const EDITABLE_DAYS = 2;

/** Shift a YYYY-MM-DD string by n days. */
const shiftDate = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const formatDate = (date: string, opts?: Intl.DateTimeFormatOptions): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  });

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

const totalHours = (items: DailyUpdateItem[]): number =>
  items.reduce((sum, i) => sum + (typeof i.hours === 'number' ? i.hours : 0), 0);

type DraftItem = { text: string; hours: string };

const toDraft = (items: DailyUpdateItem[]): DraftItem[] =>
  items.length
    ? items.map((i) => ({ text: i.text, hours: typeof i.hours === 'number' ? String(i.hours) : '' }))
    : [{ text: '', hours: '' }];

const DateNav: React.FC<{ date: string; onChange: (d: string) => void; max: string }> = ({ date, onChange, max }) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => onChange(shiftDate(date, -1))}
      className="p-2 rounded-control border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
      aria-label="Previous day"
    >
      <ChevronLeft size={16} />
    </button>
    <DateInput value={date} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} className="w-40" />
    <button
      type="button"
      onClick={() => onChange(shiftDate(date, 1))}
      disabled={date >= max}
      className="p-2 rounded-control border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:pointer-events-none"
      aria-label="Next day"
    >
      <ChevronRight size={16} />
    </button>
    {date !== max && (
      <Button variant="ghost" size="sm" onClick={() => onChange(max)}>
        Today
      </Button>
    )}
  </div>
);

const MyUpdates: React.FC<{ user: User }> = ({ user }) => {
  const today = getTodayIST();
  const [date, setDate] = useState(today);
  const [history, setHistory] = useState<DailyUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftItem[]>([{ text: '', hours: '' }]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const editable = date <= today && date > shiftDate(today, -EDITABLE_DAYS);
  const current = useMemo(() => history.find((h) => h.date === date) || null, [history, date]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.getMyDailyUpdates(user.id, 60));
    } catch (err) {
      console.error('Failed to load daily updates:', err);
      setError('Could not load your updates. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Reset the editor whenever the selected day (or its saved data) changes.
  useEffect(() => {
    setDraft(toDraft(current?.items || []));
    setDirty(false);
  }, [date, current]);

  const changeDate = (d: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setError('');
    setSuccess('');
    setDate(d > today ? today : d);
  };

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setDraft((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    setDirty(true);
    setSuccess('');
  };

  const addItem = () => {
    setDraft((prev) => [...prev, { text: '', hours: '' }]);
    setDirty(true);
  };

  const removeItem = (idx: number) => {
    setDraft((prev) => (prev.length === 1 ? [{ text: '', hours: '' }] : prev.filter((_, i) => i !== idx)));
    setDirty(true);
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    const items: DailyUpdateItem[] = [];
    for (const d of draft) {
      const text = d.text.trim();
      if (!text) continue;
      const hours = d.hours.trim() ? Number(d.hours) : undefined;
      if (hours !== undefined && (!Number.isFinite(hours) || hours < 0 || hours > 24)) {
        setError('Hours must be a number between 0 and 24.');
        return;
      }
      items.push({ text, ...(hours !== undefined && { hours }) });
    }
    if (items.length === 0) {
      setError('Add at least one thing you worked on.');
      return;
    }
    if (totalHours(items) > 24) {
      setError('Total hours for a day cannot exceed 24.');
      return;
    }
    setSaving(true);
    try {
      await api.saveDailyUpdate({ id: user.id, name: user.name, department: user.department }, date, items);
      await loadHistory();
      setSuccess('Saved.');
    } catch (err) {
      console.error('Failed to save daily update:', err);
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const draftHours = totalHours(
    draft.filter((d) => d.text.trim()).map((d) => ({ text: d.text, hours: Number(d.hours) || 0 }))
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className={`${cardCls} p-4 sm:p-6 space-y-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{formatDate(date)}</h2>
            <p className="text-sm text-slate-500">
              {date === today ? 'What did you get done today?' : 'What you got done on this day.'}
            </p>
          </div>
          <DateNav date={date} onChange={changeDate} max={today} />
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : editable ? (
          <>
            <ol className="space-y-2">
              {draft.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-2.5 w-5 shrink-0 text-right text-xs font-semibold text-slate-400">{idx + 1}.</span>
                  <textarea
                    value={item.text}
                    onChange={(e) => updateItem(idx, { text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (idx === draft.length - 1 && item.text.trim()) addItem();
                      }
                    }}
                    rows={1}
                    placeholder="e.g. Followed up with vendor on pending invoices"
                    className="flex-1 min-h-10 resize-y rounded-control border border-slate-200 hover:border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={24}
                    step={0.25}
                    value={item.hours}
                    onChange={(e) => updateItem(idx, { hours: e.target.value })}
                    placeholder="Hrs"
                    aria-label="Hours spent"
                    className="w-20 h-10 rounded-control border border-slate-200 hover:border-slate-300 bg-white px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="mt-1 p-2 rounded-control text-slate-400 hover:text-danger-600 hover:bg-danger-50"
                    aria-label="Remove item"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Button variant="secondary" size="sm" onClick={addItem}>
                <Plus size={14} className="mr-1.5" /> Add item
              </Button>
              <div className="flex items-center gap-3">
                {draftHours > 0 && <span className="text-xs text-slate-500">Total: {draftHours} h</span>}
                <Button onClick={handleSave} isLoading={saving} disabled={!dirty}>
                  {current ? 'Update' : 'Save'}
                </Button>
              </div>
            </div>
          </>
        ) : current ? (
          <ReadOnlyItems items={current.items} />
        ) : (
          <EmptyState icon={NotebookPen} title="Nothing logged for this day" />
        )}

        {!loading && !editable && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Lock size={12} /> Updates can only be edited for today and yesterday.
          </p>
        )}
        {current && (
          <p className="text-xs text-slate-400">Last saved {formatTime(current.updated_at)}</p>
        )}
        {error && <p className="text-sm text-danger-600">{error}</p>}
        {success && <p className="text-sm text-success-600">{success}</p>}
      </section>

      <aside className={`${cardCls} p-4 self-start`}>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Recent days</h3>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-500">No updates yet.</p>
        ) : (
          <ul className="space-y-1 max-h-[480px] overflow-y-auto">
            {history.map((h) => {
              const hrs = totalHours(h.items);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => changeDate(h.date)}
                    className={`w-full flex items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-sm transition-colors ${h.date === date ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                  >
                    <span>{formatDate(h.date, { weekday: 'short', year: undefined })}</span>
                    <span className="text-xs text-slate-500">
                      {h.items.length} item{h.items.length === 1 ? '' : 's'}
                      {hrs > 0 && ` · ${hrs} h`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
};

const ReadOnlyItems: React.FC<{ items: DailyUpdateItem[] }> = ({ items }) => (
  <ol className="space-y-1.5">
    {items.map((it, i) => (
      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
        <span className="w-5 shrink-0 text-right text-xs font-semibold text-slate-400 mt-0.5">{i + 1}.</span>
        <span className="flex-1 whitespace-pre-wrap">{it.text}</span>
        {typeof it.hours === 'number' && <span className="shrink-0 text-xs text-slate-500">{it.hours} h</span>}
      </li>
    ))}
  </ol>
);

const TeamUpdates: React.FC = () => {
  const today = getTodayIST();
  const [date, setDate] = useState(today);
  const [users, setUsers] = useState<User[]>([]);
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  /** Members nudged (or already in cooldown) during this visit, for today only. */
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());
  const [remindingId, setRemindingId] = useState<string | 'all' | null>(null);
  const [remindNotice, setRemindNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const isToday = date === today;

  useEffect(() => {
    api.getUsers().then(setUsers).catch((err) => console.error('Failed to load users:', err));
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setRemindNotice(null);
    api
      .getDailyUpdatesForDate(date)
      .then((u) => mounted && setUpdates(u))
      .catch((err) => console.error('Failed to load team updates:', err))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [date]);

  const s = search.toLowerCase().trim();
  const matches = (name: string, dept?: string) =>
    !s || name.toLowerCase().includes(s) || (dept || '').toLowerCase().includes(s);

  const submitted = useMemo(
    () =>
      updates
        .filter((u) => matches(u.user_name, u.department))
        .sort((a, b) => a.user_name.localeCompare(b.user_name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updates, s]
  );
  const submittedIds = useMemo(() => new Set(updates.map((u) => u.user_id)), [updates]);
  const missing = useMemo(
    () =>
      users
        .filter((u) => !submittedIds.has(u.id) && matches(u.name, u.department))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, submittedIds, s]
  );

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name || 'member';

  const summarize = (res: DailyUpdateReminderResult): { tone: 'ok' | 'error'; text: string } => {
    const skipLabels = { no_phone: 'no phone number', unapproved: 'not approved', submitted: 'already submitted', absent: 'on leave' };
    const parts: string[] = [];
    if (res.sent.length) parts.push(`Reminder sent to ${res.sent.length === 1 ? nameOf(res.sent[0]) : `${res.sent.length} members`}.`);
    if (res.cooldown.length) {
      parts.push(
        `${res.cooldown.length === 1 ? nameOf(res.cooldown[0]) : `${res.cooldown.length} members`} already reminded in the last ${Math.round(res.cooldownMs / 3600000)} h.`
      );
    }
    if (res.skipped.length) {
      parts.push(
        `Skipped: ${res.skipped.map((s) => `${nameOf(s.id)} (${skipLabels[s.reason]})`).join(', ')}.`
      );
    }
    if (res.failed.length) parts.push(`${res.failed.length} failed to send${res.aborted ? '; stopped early' : ''}.`);
    if (!parts.length) parts.push('Nobody to remind.');
    return { tone: res.failed.length && !res.sent.length ? 'error' : 'ok', text: parts.join(' ') };
  };

  const handleRemind = async (target: User | 'all') => {
    if (remindingId) return;
    const ids = target === 'all' ? missing.filter((u) => !remindedIds.has(u.id)).map((u) => u.id) : [target.id];
    if (ids.length === 0) return;
    if (target === 'all' && !window.confirm(`Send a WhatsApp reminder to ${ids.length} member${ids.length === 1 ? '' : 's'}?`)) {
      return;
    }
    setRemindingId(target === 'all' ? 'all' : target.id);
    setRemindNotice(null);
    try {
      const res = await api.remindDailyUpdate(ids);
      setRemindedIds((prev) => new Set([...prev, ...res.sent, ...res.cooldown]));
      setRemindNotice(summarize(res));
    } catch (err: any) {
      setRemindNotice({ tone: 'error', text: err?.message || 'Failed to send the WhatsApp reminder.' });
    } finally {
      setRemindingId(null);
    }
  };

  const pendingReminders = missing.filter((u) => !remindedIds.has(u.id)).length;

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{formatDate(date)}</h2>
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${updates.length} of ${users.length || '—'} members submitted`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or department"
              className="h-10 w-full sm:w-56 rounded-control border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </div>
          <DateNav date={date} onChange={(d) => setDate(d > today ? today : d)} max={today} />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            {submitted.length === 0 ? (
              <div className={cardCls}>
                <EmptyState icon={NotebookPen} title="No updates for this day" />
              </div>
            ) : (
              submitted.map((u) => {
                const hrs = totalHours(u.items);
                return (
                  <div key={u.id} className={`${cardCls} p-4`}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{u.user_name}</p>
                        {u.department && <p className="text-xs text-slate-500">{u.department}</p>}
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        {hrs > 0 && <p className="font-medium text-slate-700">{hrs} h</p>}
                        <p>Updated {formatTime(u.updated_at)}</p>
                      </div>
                    </div>
                    <ReadOnlyItems items={u.items} />
                  </div>
                );
              })
            )}
          </div>

          <aside className={`${cardCls} p-4 self-start`}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Users size={14} /> Not submitted ({missing.length})
              </h3>
              {isToday && pendingReminders > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRemind('all')}
                  disabled={remindingId !== null}
                  title="WhatsApp everyone listed who hasn't submitted"
                >
                  <BellRing size={14} className="mr-1.5" />
                  {remindingId === 'all' ? 'Sending…' : 'Remind all'}
                </Button>
              )}
            </div>
            {remindNotice && (
              <p
                className={`mb-3 rounded-control px-3 py-2 text-xs ${remindNotice.tone === 'ok' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'
                  }`}
              >
                {remindNotice.text}
              </p>
            )}
            {missing.length === 0 ? (
              <p className="text-sm text-slate-500">Everyone has submitted.</p>
            ) : (
              <ul className="space-y-1 max-h-[480px] overflow-y-auto">
                {missing.map((u) => {
                  const reminded = remindedIds.has(u.id);
                  return (
                    <li key={u.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                      <span className="min-w-0 truncate">
                        {u.name}
                        {u.department && <span className="text-xs text-slate-400"> · {u.department}</span>}
                      </span>
                      {isToday &&
                        (reminded ? (
                          <span className="shrink-0 inline-flex items-center gap-1 text-xs text-success-700">
                            <Check size={12} /> Reminded
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemind(u)}
                            disabled={remindingId !== null}
                            className="shrink-0 p-1.5 rounded-control text-slate-400 hover:text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:pointer-events-none"
                            title={`Send ${u.name} a WhatsApp reminder`}
                            aria-label={`Remind ${u.name}`}
                          >
                            {remindingId === u.id ? (
                              <span className="text-xs">…</span>
                            ) : (
                              <BellRing size={14} />
                            )}
                          </button>
                        ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export const DailyUpdates: React.FC = () => {
  const { user } = useAuth();
  const showTeam = canManageMembers(user);
  const [tab, setTab] = useState<'mine' | 'team'>('mine');

  if (!user) return null;

  return (
    <div className="space-y-4">
      {showTeam && (
        <div className="inline-flex rounded-control border border-slate-200 bg-white p-1">
          {(['mine', 'team'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-control text-sm font-medium transition-colors ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              {t === 'mine' ? 'My Updates' : 'Team Updates'}
            </button>
          ))}
        </div>
      )}
      {tab === 'team' && showTeam ? <TeamUpdates /> : <MyUpdates user={user} />}
    </div>
  );
};
