/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { BrandLogo } from '../components/ui/BrandLogo';
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
  ShieldCheck,
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
      'Create a task and assign it to one or more members — with dates, recurrence, a verifier, required attachments, and audit guidelines.',
  },
  {
    icon: Table2,
    title: 'Task Table',
    description:
      'Your task workspace. Admins see every task in the company; everyone else sees their own. Filter, sort, and complete tasks right from the list.',
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
    description: 'The red zone — every task past its due date, so nothing slips through unnoticed.',
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
      'Repeating task templates — each cycle automatically creates a fresh task for the doer on schedule.',
  },
  {
    icon: CheckCircle2,
    title: 'Completed Tasks',
    description: 'Full history of completed and closed tasks, with attachments and verification records.',
  },
  {
    icon: BarChart3,
    title: 'KPI',
    description:
      'On-time vs late performance, with holidays and absences excluded. Admins see the whole team; everyone else sees their own scorecard.',
  },
  {
    icon: LifeBuoy,
    title: 'Helper Dashboard',
    description:
      'Raise a help ticket to a teammate with proposed solutions, track it to resolution, and rate the help received.',
  },
  {
    icon: Settings,
    title: 'Settings',
    description:
      'Company holidays, absence records, and member management with departments and roles.',
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp updates',
    description:
      'Sign in with a WhatsApp OTP — no passwords. Assignments arrive instantly, and a daily reminder nudges anyone with open tasks.',
  },
];

export const About: React.FC = () => {
  const { user } = useAuth();
  const isAdminRole = user?.role === UserRole.ADMIN;

  const rows = FEATURES.filter(
    (f) => !(f.adminOnly && !isAdminRole) && !(f.nonAdminOnly && isAdminRole)
  );

  return (
    <div className="max-w-4xl space-y-5">
      {/* Hero */}
      <div className="bg-brand-600 rounded-card shadow-card p-8 sm:p-10 text-center">
        <div className="text-white flex justify-center">
          <BrandLogo size="lg" />
        </div>
        <p className="mt-5 text-sm text-white/70 leading-relaxed max-w-xl mx-auto">
          The team&apos;s task management system — assign work, track it to completion, verify the
          result, and keep everyone accountable, with WhatsApp keeping each member informed along
          the way.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-white/60">
          <ShieldCheck size={14} />
          Secured with passwordless WhatsApp sign-in
        </div>
      </div>

      {/* Feature grid */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 px-1">
          What each section does
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {rows.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-card border border-slate-200 shadow-card p-5 flex gap-4"
            >
              <span className="w-10 h-10 shrink-0 rounded-control bg-brand-50 flex items-center justify-center">
                <f.icon size={18} className="text-brand-600" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{f.title}</p>
                <p className="mt-1 text-[13px] text-slate-500 leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Credit */}
      <div className="bg-white rounded-card border border-slate-200 shadow-card px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
        <p className="text-sm text-slate-600">
          Developed by <span className="font-semibold text-slate-900">Nerdshouse Technologies LLP</span>
          {' '}for <span className="font-semibold text-slate-900">Briyo Supplements</span>
        </p>
        <a
          href="https://nerdshouse.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-brand-600 hover:text-brand-800"
        >
          nerdshouse.com
        </a>
      </div>
    </div>
  );
};
