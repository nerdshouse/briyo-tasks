/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React from 'react';
import { TaskStatus } from '../../types';
import { cn } from '../../lib/cn';

const STATUS_STYLES: Record<TaskStatus, { classes: string; label: string }> = {
  completed: { classes: 'bg-success-100 text-success-800', label: 'Completed' },
  overdue: { classes: 'bg-danger-100 text-danger-800', label: 'Overdue' },
  pending: { classes: 'bg-warning-100 text-warning-800', label: 'Pending' },
  in_progress: { classes: 'bg-warning-100 text-warning-800', label: 'In Progress' },
  pending_verification: { classes: 'bg-info-100 text-info-800', label: 'Pending Verification' },
  correction_required: { classes: 'bg-review-100 text-review-800', label: 'Correction Required' },
  scheduled: { classes: 'bg-slate-100 text-slate-700', label: 'Scheduled' },
  cancelled: { classes: 'bg-slate-100 text-slate-700', label: 'Cancelled' },
  closed_permanently: { classes: 'bg-slate-100 text-slate-700', label: 'Closed' },
};

interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const style = STATUS_STYLES[status] ?? {
    classes: 'bg-slate-100 text-slate-700',
    label: status,
  };
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        style.classes,
        className
      )}
    >
      {style.label}
    </span>
  );
};
