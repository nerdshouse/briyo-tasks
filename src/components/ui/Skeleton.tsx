/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React from 'react';
import { cn } from '../../lib/cn';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse rounded-lg bg-slate-200/70', className)} />
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 8 }) => (
  <div className="bg-white rounded-card border border-slate-200 shadow-card p-4 space-y-3">
    <Skeleton className="h-9 w-full" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-4 w-1/6" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    ))}
  </div>
);
