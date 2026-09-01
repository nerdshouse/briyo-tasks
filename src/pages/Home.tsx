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
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  PartyPopper,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Task, Holiday, Absence, UserRole } from '../types';
import { getTodayIST } from '../lib/dates';
import { computeKpi, formatDateDDMMYYYY } from '../lib/utils';
import { CompleteTaskModal } from '../components/ui/CompleteTaskModal';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';

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

export const Home: React.FC = () => {
  const { user } = useAuth();
  const isAdminRole = user?.role === UserRole.ADMIN;

  const [loading, setLoading] = useState(true);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [companyTasks, setCompanyTasks] = useState<Task[] | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [completing, setCompleting] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [mine, hols, abs, all] = await Promise.all([
        api.getTasksAssignedTo(user.id),
        api.getHolidays(),
        api.getAbsences(),
        isAdminRole ? api.getTasks() : Promise.resolve(null),
      ]);
      setMyTasks(mine.filter((t) => !t.is_recurring_master));
      setHolidays(hols);
      setAbsences(abs);
      setCompanyTasks(all ? all.filter((t) => !t.is_recurring_master) : null);
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
        await api.updateTask(t.id, {
          ...baseUpdates,
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      }
      setCompleteTask(null);
      await load();
    } catch (err) {
      console.error('Failed to complete task:', err);
    } finally {
      setCompleting(false);
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

  return (
    <div className="max-w-6xl space-y-5">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          {greetingForHourIST()}, {user.name.trim().split(/\s+/)[0]}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
          {isAdminRole && <span className="text-slate-400"> · company-wide overview</span>}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="bg-white rounded-card border border-slate-200 shadow-card p-4 flex items-center gap-3 hover:border-slate-300 transition-colors"
          >
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Checklist */}
        <div className="lg:col-span-2 bg-white rounded-card border border-slate-200 shadow-card">
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
            <div className="p-5 space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
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

        {/* Right column */}
        <div className="space-y-5">
          <div className="bg-white rounded-card border border-slate-200 shadow-card">
            <div className="p-4 md:p-5 border-b border-slate-100 flex items-center gap-2">
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

          <div className="bg-white rounded-card border border-slate-200 shadow-card">
            <div className="p-4 md:p-5 border-b border-slate-100 flex items-center gap-2">
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
    </div>
  );
};
