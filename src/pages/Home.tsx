/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ClipboardList,
  Flame,
  Gauge,
  LifeBuoy,
  Megaphone,
  PartyPopper,
  Plus,
  UserMinus,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Task, TaskLog, Holiday, Absence, UserRole } from '../types';
import { getTodayIST } from '../lib/dates';
import {
  computeKpi,
  formatDateDDMMYYYY,
  reminderCooldownRemainingMs,
  formatCooldownRemaining,
} from '../lib/utils';
import { CompleteTaskModal } from '../components/ui/CompleteTaskModal';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';

/** Statuses that still need the doer's attention. */
const OPEN_STATUSES = ['pending', 'in_progress', 'overdue', 'correction_required'] as const;
const isOpen = (t: Task) => (OPEN_STATUSES as readonly string[]).includes(t.status);

const greetingForHourIST = (): string => {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date())
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const addDaysISO = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const timeAgo = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const ACTIVITY_VERBS: Record<string, string> = {
  created: 'assigned',
  updated: 'edited',
  status_changed: 'updated',
  deleted: 'deleted',
  closed_permanently: 'closed',
  audit_set: 'audited',
  verified: 'verified',
  verification_rejected: 'sent back',
  audit_sop_updated: 'updated the SOP on',
  reminder_sent: 'sent a reminder for',
};

interface StatCard {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  tone: 'brand' | 'danger' | 'warning' | 'success';
  to: string;
}

const TONE_STYLES: Record<StatCard['tone'], { chip: string; icon: string }> = {
  brand: { chip: 'bg-brand-50', icon: 'text-brand-600' },
  danger: { chip: 'bg-danger-50', icon: 'text-danger-600' },
  warning: { chip: 'bg-warning-50', icon: 'text-warning-600' },
  success: { chip: 'bg-success-50', icon: 'text-success-600' },
};

const cardCls = 'bg-white rounded-card border border-slate-200 shadow-card';
const cardHeadCls = 'p-4 md:p-5 border-b border-slate-100 flex items-center gap-2';

export const Home: React.FC = () => {
  const { user } = useAuth();
  const isAdminRole = user?.role === UserRole.ADMIN;

  const [loading, setLoading] = useState(true);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [companyTasks, setCompanyTasks] = useState<Task[] | null>(null);
  const [verifierQueue, setVerifierQueue] = useState<Task[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [activity, setActivity] = useState<TaskLog[]>([]);
  const [announcement, setAnnouncement] = useState<{ message: string; active: boolean } | null>(null);
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [completing, setCompleting] = useState(false);
  const [remindingUserId, setRemindingUserId] = useState<string | null>(null);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announceDraft, setAnnounceDraft] = useState('');
  const [announceActive, setAnnounceActive] = useState(true);
  const [announceSaving, setAnnounceSaving] = useState(false);
  const [announceError, setAnnounceError] = useState('');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [mine, hols, abs, ann, verif, all, logs] = await Promise.all([
        api.getTasksAssignedTo(user.id),
        api.getHolidays(),
        api.getAbsences(),
        api.getAnnouncement(),
        api
          .getAllTasksByFilters({ verifierId: user.id, status: 'pending_verification' })
          .catch(() => [] as Task[]),
        isAdminRole ? api.getTasks() : Promise.resolve(null),
        isAdminRole ? api.getRecentTaskLogs(10).catch(() => [] as TaskLog[]) : Promise.resolve([] as TaskLog[]),
      ]);
      setMyTasks(mine.filter((t) => !t.is_recurring_master));
      setHolidays(hols);
      setAbsences(abs);
      setAnnouncement(ann);
      setVerifierQueue(verif.filter((t) => !t.is_recurring_master));
      setCompanyTasks(all ? all.filter((t) => !t.is_recurring_master) : null);
      setActivity(logs);
    } catch (err) {
      console.error('Failed to load home dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const today = getTodayIST();
  const scopeTasks = isAdminRole && companyTasks ? companyTasks : myTasks;

  const stats = useMemo(() => {
    const open = scopeTasks.filter(isOpen);
    const dueToday = open.filter((t) => t.due_date === today).length;
    const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
    const kpi = isAdminRole
      ? computeKpi(scopeTasks, holidays, absences)
      : computeKpi(myTasks, holidays, absences, user?.id);
    const completedCount = kpi.on_time_completed + kpi.late_completed;
    const score = completedCount === 0 ? null : Math.round((kpi.on_time_completed / completedCount) * 100);
    return { dueToday, overdue, openCount: open.length, score };
  }, [scopeTasks, myTasks, holidays, absences, today, isAdminRole, user?.id]);

  const checklist = useMemo(() => {
    const open = myTasks.filter(isOpen);
    const rank = (t: Task) => (t.due_date && t.due_date < today ? 0 : t.due_date === today ? 1 : 2);
    return open
      .sort((a, b) => rank(a) - rank(b) || (a.due_date || '').localeCompare(b.due_date || ''))
      .slice(0, 8);
  }, [myTasks, today]);

  const corrections = useMemo(() => myTasks.filter((t) => t.status === 'correction_required').length, [myTasks]);

  const completedToday = useMemo(
    () =>
      myTasks.filter(
        (t) =>
          (t.status === 'completed' || t.status === 'pending_verification') &&
          (t.completed_at || t.updated_at || '').slice(0, 10) === today
      ).length,
    [myTasks, today]
  );

  const upcomingHolidays = useMemo(
    () => holidays.filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4),
    [holidays, today]
  );

  const awaitingVerification = useMemo(
    () => myTasks.filter((t) => t.status === 'pending_verification').length,
    [myTasks]
  );

  /** Members absent today (deduped names). */
  const outToday = useMemo(() => {
    const names = absences
      .filter((a) => a.from_date <= today && today <= a.to_date)
      .map((a) => a.user_name);
    return [...new Set(names)];
  }, [absences, today]);

  const holidayToday = useMemo(() => holidays.find((h) => h.date === today), [holidays, today]);

  /** Next 7 days: open-task due counts + holiday markers. */
  const week = useMemo(() => {
    const open = scopeTasks.filter(isOpen);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDaysISO(today, i);
      const d = new Date(`${date}T00:00:00Z`);
      return {
        date,
        weekday: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
        day: d.getUTCDate(),
        due: open.filter((t) => t.due_date === date).length,
        holiday: holidays.find((h) => h.date === date),
        isToday: i === 0,
      };
    });
  }, [scopeTasks, holidays, today]);

  /** Admin: per-member open/overdue workload, worst first. */
  const workload = useMemo(() => {
    if (!isAdminRole || !companyTasks) return [];
    const byMember = new Map<string, { name: string; open: number; overdue: number; nudgeTask: Task | null }>();
    for (const t of companyTasks.filter(isOpen)) {
      if (!t.assigned_to_id || t.assignee_deleted) continue;
      const row = byMember.get(t.assigned_to_id) || { name: t.assigned_to_name, open: 0, overdue: 0, nudgeTask: null };
      row.open += 1;
      const isLate = !!t.due_date && t.due_date < today;
      if (isLate) row.overdue += 1;
      // Nudge target: the most overdue task, else the earliest-due open one.
      if (
        !row.nudgeTask ||
        (t.due_date || '9999') < (row.nudgeTask.due_date || '9999')
      ) {
        row.nudgeTask = t;
      }
      byMember.set(t.assigned_to_id, row);
    }
    return [...byMember.entries()]
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
      .slice(0, 6);
  }, [isAdminRole, companyTasks, today]);

  /** On-time % per month, last 4 months (scope: company for admin, personal otherwise). */
  const trend = useMemo(() => {
    const source = scopeTasks.filter((t) => t.status === 'completed' && t.completed_at && t.due_date);
    const months: { label: string; pct: number | null }[] = [];
    const now = new Date(`${today}T00:00:00Z`);
    for (let i = 3; i >= 0; i--) {
      const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = m.toISOString().slice(0, 7);
      const done = source.filter((t) => (t.completed_at || '').slice(0, 7) === key);
      const onTime = done.filter((t) => (t.completed_at || '').slice(0, 10) <= t.due_date).length;
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      months.push({
        label: MONTHS[m.getUTCMonth()],
        pct: done.length === 0 ? null : Math.round((onTime / done.length) * 100),
      });
    }
    return months;
  }, [scopeTasks, today]);

  /** Days since the member last went late (0 while anything is overdue). */
  const streak = useMemo(() => {
    const openOverdue = myTasks.some((t) => isOpen(t) && t.due_date && t.due_date < today);
    if (openOverdue) return 0;
    const lateDates = myTasks
      .filter((t) => t.completed_at && t.due_date && t.completed_at.slice(0, 10) > t.due_date)
      .map((t) => (t.completed_at as string).slice(0, 10));
    const anchor = lateDates.sort().pop();
    if (!anchor) {
      const first = myTasks.map((t) => t.created_at?.slice(0, 10)).filter(Boolean).sort()[0];
      if (!first) return null;
      return Math.floor((new Date(today).getTime() - new Date(first as string).getTime()) / 86400000);
    }
    return Math.floor((new Date(today).getTime() - new Date(anchor).getTime()) / 86400000);
  }, [myTasks, today]);

  const handleComplete = async (
    t: Task,
    url?: string,
    text?: string,
    remark?: string,
    opts?: { closePermanently?: boolean; attachment_urls?: string[] }
  ) => {
    if (!user || completing) return;
    setCompleting(true);
    try {
      const baseUpdates: Partial<Task> = {
        ...(url && { attachment_url: url }),
        ...(opts?.attachment_urls && { attachment_urls: opts.attachment_urls }),
        ...(text && { attachment_text: text }),
        ...(!opts?.closePermanently && { doer_remark: remark?.trim() }),
      };
      if (opts?.closePermanently && t.recurring !== 'none') {
        await api.updateTask(t.id, { ...baseUpdates, status: 'closed_permanently' });
      } else if (t.verification_required) {
        await api.updateTask(t.id, { ...baseUpdates, status: 'pending_verification' });
      } else {
        await api.updateTask(t.id, { ...baseUpdates, status: 'completed', completed_at: new Date().toISOString() });
      }
      setCompleteTask(null);
      await load();
    } catch (err) {
      console.error('Failed to complete task:', err);
    } finally {
      setCompleting(false);
    }
  };

  const handleNudge = async (memberId: string, task: Task | null) => {
    if (!task || remindingUserId) return;
    setRemindingUserId(memberId);
    try {
      await api.sendTaskReminder(task.id);
      const nowIso = new Date().toISOString();
      setCompanyTasks((prev) =>
        prev
          ? prev.map((x) =>
              x.id === task.id
                ? { ...x, lastRemindedAt: { ...(x.lastRemindedAt || {}), [x.assigned_to_id]: nowIso } }
                : x
            )
          : prev
      );
    } catch (err: any) {
      window.alert(err?.message || 'Failed to send the WhatsApp reminder.');
    } finally {
      setRemindingUserId(null);
    }
  };

  const openAnnounceModal = () => {
    setAnnounceDraft(announcement?.message || '');
    setAnnounceActive(announcement ? announcement.active : true);
    setAnnounceError('');
    setAnnounceOpen(true);
  };

  const saveAnnouncement = async () => {
    if (!user) return;
    setAnnounceSaving(true);
    setAnnounceError('');
    try {
      const message = announceDraft.trim();
      const active = announceActive && message.length > 0;
      await api.setAnnouncement(message, active, { id: user.id, name: user.name, role: user.role });
      setAnnouncement({ message, active });
      setAnnounceOpen(false);
    } catch (err: any) {
      setAnnounceError(err?.message || 'Failed to save announcement.');
    } finally {
      setAnnounceSaving(false);
    }
  };

  if (!user) return null;

  const cards: StatCard[] = [
    { label: 'Due Today', value: String(stats.dueToday), icon: CalendarClock, tone: 'brand', to: '/tasks' },
    { label: 'Overdue', value: String(stats.overdue), icon: AlertTriangle, tone: 'danger', to: '/redzone' },
    { label: 'Open Tasks', value: String(stats.openCount), icon: ClipboardList, tone: 'warning', to: '/tasks' },
    { label: 'On-time', value: stats.score == null ? '—' : `${stats.score}%`, icon: Gauge, tone: 'success', to: '/kpi' },
  ];

  const dueChip = (t: Task) => {
    if (t.due_date && t.due_date < today)
      return <span className="text-xs font-semibold text-danger-600 whitespace-nowrap">Overdue · {formatDateDDMMYYYY(t.due_date)}</span>;
    if (t.due_date === today)
      return <span className="text-xs font-semibold text-warning-600 whitespace-nowrap">Due today</span>;
    return <span className="text-xs text-slate-500 whitespace-nowrap">{t.due_date ? formatDateDDMMYYYY(t.due_date) : 'No due date'}</span>;
  };

  const needsAction = verifierQueue.length > 0 || corrections > 0;

  return (
    <div className="max-w-6xl space-y-5">
      {/* Greeting + quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {greetingForHourIST()}, {user.name.trim().split(/\s+/)[0]}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
            {isAdminRole && <span className="text-slate-400"> · company-wide overview</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/assign">
            <Button size="sm" variant="secondary"><span className="inline-flex items-center gap-1.5"><Plus size={14} /> Assign task</span></Button>
          </Link>
          <Link to="/help/new">
            <Button size="sm" variant="secondary"><span className="inline-flex items-center gap-1.5"><LifeBuoy size={14} /> Get help</span></Button>
          </Link>
          <Link to="/settings">
            <Button size="sm" variant="secondary"><span className="inline-flex items-center gap-1.5"><UserMinus size={14} /> Mark absent</span></Button>
          </Link>
          {isAdminRole && (
            <Button size="sm" variant="secondary" onClick={openAnnounceModal}>
              <span className="inline-flex items-center gap-1.5"><Megaphone size={14} /> Announcement</span>
            </Button>
          )}
        </div>
      </div>

      {/* Announcement banner */}
      {announcement?.active && announcement.message && (
        <div className="rounded-card border border-brand-200 bg-brand-50 px-4 py-3 flex items-start gap-3">
          <Megaphone size={16} className="text-brand-600 mt-0.5 shrink-0" />
          <p className="text-sm text-brand-800 whitespace-pre-wrap flex-1">{announcement.message}</p>
        </div>
      )}

      {/* Needs your action */}
      {needsAction && (
        <div className="rounded-card border border-warning-200 bg-warning-50 px-4 py-3 space-y-1.5">
          {verifierQueue.length > 0 && (
            <Link to="/approve" className="flex items-center gap-2 text-sm text-warning-800 hover:underline">
              <ClipboardCheck size={15} className="shrink-0" />
              <span>
                <span className="font-semibold">{verifierQueue.length}</span> task{verifierQueue.length === 1 ? '' : 's'} waiting for your approval
              </span>
            </Link>
          )}
          {corrections > 0 && (
            <Link to="/my-tasks" className="flex items-center gap-2 text-sm text-danger-700 hover:underline">
              <AlertTriangle size={15} className="shrink-0" />
              <span>
                <span className="font-semibold">{corrections}</span> task{corrections === 1 ? '' : 's'} sent back for correction
              </span>
            </Link>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className={`${cardCls} p-4 flex items-center gap-3 hover:border-slate-300 transition-colors`}>
            <span className={`w-10 h-10 shrink-0 rounded-control flex items-center justify-center ${TONE_STYLES[c.tone].chip}`}>
              <c.icon size={18} className={TONE_STYLES[c.tone].icon} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 truncate">{c.label}</p>
              <p className="text-xl font-bold text-slate-900">{loading ? '…' : c.value}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Week strip */}
      <div className={`${cardCls} p-3 sm:p-4`}>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {week.map((d) => (
            <div
              key={d.date}
              title={d.holiday ? d.holiday.name : undefined}
              className={`rounded-control px-1 py-2 text-center ${
                d.isToday ? 'bg-brand-600 text-white' : d.holiday ? 'bg-warning-50' : 'bg-slate-50'
              }`}
            >
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${d.isToday ? 'text-white/70' : 'text-slate-400'}`}>
                {d.weekday}
              </p>
              <p className={`text-sm font-bold ${d.isToday ? 'text-white' : 'text-slate-800'}`}>{d.day}</p>
              <p className={`text-[11px] mt-0.5 font-medium ${d.isToday ? 'text-white/80' : d.due > 0 ? 'text-brand-600' : 'text-slate-400'}`}>
                {d.holiday ? '🎉' : d.due > 0 ? `${d.due} due` : '—'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Checklist */}
          <div className={cardCls}>
            <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">My checklist</h3>
                <p className="text-sm text-slate-500">Tick a task to mark it complete.</p>
              </div>
              <Link to="/my-tasks" className="text-xs font-medium text-brand-600 hover:text-brand-800 whitespace-nowrap">
                View all
              </Link>
            </div>
            {loading ? (
              <div className="p-5 space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            ) : checklist.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 size={28} className="mx-auto text-success-500" />
                <p className="mt-2 text-sm font-medium text-slate-700">All caught up!</p>
                <p className="text-sm text-slate-500">
                  No open tasks on your plate{completedToday > 0 ? ` — ${completedToday} completed today` : ''}.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {checklist.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 md:px-5 py-3">
                    <button
                      onClick={() => setCompleteTask(t)}
                      title="Mark complete"
                      aria-label={`Mark "${t.title}" complete`}
                      className="shrink-0 text-slate-300 hover:text-success-600 transition-colors"
                    >
                      <Circle size={20} strokeWidth={1.75} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                      <p className="text-xs text-slate-500 truncate">By {t.assigned_by_name}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {dueChip(t)}
                      <span className="hidden sm:inline-flex"><StatusBadge status={t.status} /></span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!loading && checklist.length > 0 && completedToday > 0 && (
              <p className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                <CheckCircle2 size={13} className="inline -mt-0.5 mr-1 text-success-500" />
                {completedToday} task{completedToday === 1 ? '' : 's'} completed today
              </p>
            )}
          </div>

          {/* Team workload (admin) */}
          {isAdminRole && (
            <div className={cardCls}>
              <div className={cardHeadCls}>
                <Users size={16} className="text-brand-600" />
                <h3 className="font-semibold text-slate-900">Team workload</h3>
                <span className="ml-auto text-xs text-slate-400">bell nudges their most urgent task</span>
              </div>
              {loading ? (
                <div className="p-5"><Skeleton className="h-24" /></div>
              ) : workload.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">No open tasks across the team.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {workload.map((m) => {
                    const rem = m.nudgeTask ? reminderCooldownRemainingMs(m.nudgeTask) : 0;
                    const disabled = !m.nudgeTask || rem > 0 || remindingUserId === m.id;
                    return (
                      <li key={m.id} className="px-4 md:px-5 py-3 flex items-center gap-3">
                        <span className="w-8 h-8 shrink-0 rounded-full bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center">
                          {m.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                          <p className="text-xs text-slate-500">
                            {m.open} open{m.overdue > 0 && <span className="text-danger-600 font-semibold"> · {m.overdue} overdue</span>}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="!px-2"
                          disabled={disabled}
                          onClick={() => handleNudge(m.id, m.nudgeTask)}
                          title={
                            rem > 0
                              ? `Reminded recently · ${formatCooldownRemaining(rem)} left`
                              : `WhatsApp-remind "${m.nudgeTask?.title || ''}"`
                          }
                        >
                          <Bell size={14} />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Recent activity (admin) */}
          {isAdminRole && (
            <div className={cardCls}>
              <div className={cardHeadCls}>
                <ClipboardList size={16} className="text-brand-600" />
                <h3 className="font-semibold text-slate-900">Recent activity</h3>
              </div>
              {loading ? (
                <div className="p-5"><Skeleton className="h-24" /></div>
              ) : activity.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">No activity yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activity.map((log) => (
                    <li key={log.id} className="px-4 md:px-5 py-2.5 flex items-baseline gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-slate-600">
                        <span className="font-medium text-slate-800">{log.actor_name}</span>{' '}
                        {ACTIVITY_VERBS[log.action] || log.action}{' '}
                        <span className="font-medium text-slate-800">{log.task_title}</span>
                      </span>
                      <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(log.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Who's out today */}
          <div className={cardCls}>
            <div className={cardHeadCls}>
              <UserMinus size={16} className="text-brand-600" />
              <h3 className="font-semibold text-slate-900">Who&apos;s out today</h3>
            </div>
            {loading ? (
              <div className="p-5"><Skeleton className="h-10" /></div>
            ) : (
              <div className="p-4 md:p-5 space-y-2">
                {holidayToday && (
                  <p className="text-sm text-warning-700">
                    <PartyPopper size={14} className="inline -mt-0.5 mr-1.5" />
                    Company holiday: <span className="font-medium">{holidayToday.name}</span>
                  </p>
                )}
                {outToday.length === 0 ? (
                  <p className="text-sm text-slate-500">Everyone&apos;s in today.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {outToday.map((name) => (
                      <li key={name} className="text-sm text-slate-700">{name}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Holidays */}
          <div className={cardCls}>
            <div className={cardHeadCls}>
              <CalendarDays size={16} className="text-brand-600" />
              <h3 className="font-semibold text-slate-900">Upcoming holidays</h3>
            </div>
            {loading ? (
              <div className="p-5"><Skeleton className="h-16" /></div>
            ) : upcomingHolidays.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">No upcoming holidays.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingHolidays.map((h) => (
                  <li key={h.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700 truncate">
                      <PartyPopper size={14} className="inline -mt-0.5 mr-1.5 text-warning-500" />
                      {h.name}
                    </span>
                    <span className="text-xs font-medium text-slate-500 whitespace-nowrap">{formatDateDDMMYYYY(h.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* On-time trend */}
          <div className={cardCls}>
            <div className={cardHeadCls}>
              <Gauge size={16} className="text-brand-600" />
              <h3 className="font-semibold text-slate-900">On-time trend</h3>
            </div>
            <div className="p-4 md:p-5">
              {loading ? (
                <Skeleton className="h-20" />
              ) : (
                <div className="flex items-end justify-between gap-3 h-24">
                  {trend.map((m) => (
                    <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[11px] font-semibold text-slate-600">{m.pct == null ? '—' : `${m.pct}%`}</span>
                      <div
                        className={`w-full max-w-8 rounded-t ${m.pct == null ? 'bg-slate-100' : m.pct >= 80 ? 'bg-success-500' : m.pct >= 50 ? 'bg-warning-500' : 'bg-danger-500'}`}
                        style={{ height: `${Math.max(m.pct ?? 0, 4)}%` }}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{m.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* At a glance */}
          <div className={cardCls}>
            <div className={cardHeadCls}>
              <ClipboardCheck size={16} className="text-brand-600" />
              <h3 className="font-semibold text-slate-900">At a glance</h3>
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              <li className="px-5 py-3 flex items-center justify-between">
                <span className="text-slate-600">Completed today</span>
                <span className="font-semibold text-slate-900 tabular-nums">{loading ? '…' : completedToday}</span>
              </li>
              <li className="px-5 py-3 flex items-center justify-between">
                <span className="text-slate-600">Awaiting verification</span>
                <span className="font-semibold text-slate-900 tabular-nums">{loading ? '…' : awaitingVerification}</span>
              </li>
              <li className="px-5 py-3 flex items-center justify-between">
                <span className="text-slate-600">{isAdminRole ? 'Open (company)' : 'My open tasks'}</span>
                <span className="font-semibold text-slate-900 tabular-nums">{loading ? '…' : stats.openCount}</span>
              </li>
              {streak != null && (
                <li className="px-5 py-3 flex items-center justify-between">
                  <span className="text-slate-600">
                    <Flame size={14} className="inline -mt-0.5 mr-1 text-warning-500" />
                    On-time streak
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {loading ? '…' : `${Math.min(streak, 99)}${streak > 99 ? '+' : ''} day${streak === 1 ? '' : 's'}`}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {completeTask && (
        <CompleteTaskModal
          task={completeTask}
          onClose={() => setCompleteTask(null)}
          onComplete={handleComplete}
          completing={completing}
        />
      )}

      {/* Announcement editor (admin) */}
      <Modal
        open={announceOpen}
        onClose={() => setAnnounceOpen(false)}
        title="Company announcement"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAnnounceOpen(false)}>Cancel</Button>
            <Button onClick={saveAnnouncement} isLoading={announceSaving}>Save</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Shown as a banner on everyone&apos;s Home page.</p>
          <textarea
            value={announceDraft}
            onChange={(e) => setAnnounceDraft(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="e.g. Office closed this Friday for Diwali."
            className="w-full rounded-control border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={announceActive}
              onChange={(e) => setAnnounceActive(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show the banner
          </label>
          {announceError && <p className="text-sm text-danger-600">{announceError}</p>}
        </div>
      </Modal>
    </div>
  );
};
