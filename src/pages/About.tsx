/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import {
  ClipboardList,
  ClipboardCheck,
  Table2,
  AlertTriangle,
  Repeat,
  CheckCircle2,
  BarChart3,
  LifeBuoy,
  Settings,
  MessageSquare,
  LucideIcon,
} from 'lucide-react';

interface FeatureRow {
  icon: LucideIcon;
  title: string;
  description: string;
  adminOnly?: boolean;
  nonAdminOnly?: boolean;
}

const FEATURES: FeatureRow[] = [
  {
    icon: ClipboardList,
    title: 'Assign Task',
    description:
      'Create a task and assign it to one or more members — with start/due dates, recurrence (daily to yearly), a verifier if sign-off is needed, required attachments, and audit guidelines.',
  },
  {
    icon: Table2,
    title: 'Task Table',
    description:
      'Your task workspace. Admins see every task in the company; everyone else sees their own tasks. Filter by member, status, recurrence, or date, and complete tasks right from the list.',
  },
  {
    icon: ClipboardCheck,
    title: 'Approve Task',
    description:
      'Tasks waiting for your verification. Approve them as complete, or reject with a comment so the doer can fix and resubmit.',
  },
  {
    icon: ClipboardCheck,
    title: 'Verification Pending',
    description: 'A quick overview of how many approvals each verifier still has outstanding.',
    adminOnly: true,
  },
  {
    icon: AlertTriangle,
    title: 'Overdue',
    description:
      'The red zone — every task past its due date, so nothing slips through unnoticed.',
  },
  {
    icon: ClipboardList,
    title: 'Assigned By Me',
    description: 'Track every task you have assigned to others and follow its progress.',
    nonAdminOnly: true,
  },
  {
    icon: Repeat,
    title: 'Recurring Tasks',
    description:
      'Manage repeating task templates. Each cycle automatically creates a fresh task for the doer on schedule.',
  },
  {
    icon: CheckCircle2,
    title: 'Completed Tasks',
    description: 'The full history of completed and permanently closed tasks, with attachments and verification records.',
  },
  {
    icon: BarChart3,
    title: 'KPI',
    description:
      'Performance at a glance — tasks assigned, done on time, late, and overdue. Admins see the whole team; everyone else sees their own scorecard. Holidays and marked absences are excluded.',
  },
  {
    icon: LifeBuoy,
    title: 'Helper Dashboard',
    description:
      'Stuck on something? Raise a help ticket to a teammate with your proposed solutions, track it to resolution, and rate the help you received.',
  },
  {
    icon: Settings,
    title: 'Settings',
    description:
      'Company holidays, absence records, and (for admins and sub-admins) member management with departments and roles.',
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp updates',
    description:
      'You sign in with a WhatsApp OTP — no passwords. New task assignments arrive instantly on WhatsApp, and a daily reminder nudges anyone with open tasks.',
  },
];

export const About: React.FC = () => {
  const { user } = useAuth();
  const isAdminRole = user?.role === UserRole.ADMIN;

  const rows = FEATURES.filter(
    (f) => !(f.adminOnly && !isAdminRole) && !(f.nonAdminOnly && isAdminRole)
  );

  return (
    <div className="max-w-3xl space-y-5">
      <div className="bg-white rounded-card border border-slate-200 shadow-card p-6 sm:p-8">
        <h2 className="text-3xl font-extrabold tracking-tight text-brand-600">BRIYO Tasks</h2>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          Briyo Tasks is the team&apos;s task management system: assign work, track it to
          completion, verify the result, and keep everyone accountable — with WhatsApp keeping
          each member informed along the way.
        </p>
      </div>

      <div className="bg-white rounded-card border border-slate-200 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">What each section does</h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {rows.map((f) => (
            <li key={f.title} className="flex gap-4 px-6 py-4">
              <span className="w-9 h-9 shrink-0 rounded-control bg-brand-50 flex items-center justify-center">
                <f.icon size={18} className="text-brand-600" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{f.title}</p>
                <p className="mt-0.5 text-sm text-slate-500 leading-relaxed">{f.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center text-xs text-slate-400 pb-2">
        Developed by <span className="font-medium text-slate-500">Nerdshouse Technologies LLP</span> for{' '}
        <span className="font-medium text-slate-500">Briyo Supplements LLP</span>
      </p>
    </div>
  );
};
