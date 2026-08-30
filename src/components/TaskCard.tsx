/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React from 'react';
import { TaskStatus } from '../types';
import { StatusBadge } from './ui/StatusBadge';
import { cn } from '../lib/cn';

interface TaskCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  status?: TaskStatus;
  tone?: 'overdue' | 'holiday';
  /** Key/value lines (assignee, dates, etc.). */
  meta?: React.ReactNode;
  /** Action buttons row rendered at the bottom. */
  actions?: React.ReactNode;
}

/** Mobile card representation of one task-table row. */
export const TaskCard: React.FC<TaskCardProps> = ({
  title,
  description,
  status,
  tone,
  meta,
  actions,
}) => (
  <div
    className={cn(
      'bg-white rounded-card border border-slate-200 shadow-card p-4',
      tone === 'overdue' && 'border-l-4 border-l-danger-500',
      tone === 'holiday' && 'border-l-4 border-l-warning-500'
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-semibold text-slate-900 break-words min-w-0">{title}</p>
      {status && <StatusBadge status={status} className="shrink-0" />}
    </div>
    {description && (
      <div className="mt-1 text-sm text-slate-600 line-clamp-2 break-all">{description}</div>
    )}
    {meta && <div className="mt-3 space-y-1 text-xs text-slate-500">{meta}</div>}
    {actions && (
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
        {actions}
      </div>
    )}
  </div>
);

/** One label/value line inside a TaskCard's meta block. */
export const TaskCardMeta: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <p className="flex gap-1.5">
    <span className="font-medium text-slate-400">{label}:</span>
    <span className="text-slate-600">{children}</span>
  </p>
);
