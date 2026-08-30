/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useState } from 'react';
import { SlidersHorizontal, ChevronUp } from 'lucide-react';

interface FilterBarProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  /** Number of currently active (non-default) filters, shown on the mobile toggle. */
  activeCount?: number;
}

/**
 * Toolbar for page filters. On ≥sm screens the filters render inline in a
 * wrapping row with actions right-aligned. On phones they collapse behind a
 * "Filters" disclosure button so content isn't pushed below the fold.
 */
export const FilterBar: React.FC<FilterBarProps> = ({ children, actions, activeCount = 0 }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4">
      {/* Mobile: disclosure row */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-2 h-10 px-3.5 rounded-control border border-slate-200 bg-white text-sm font-medium text-slate-700"
        >
          {open ? <ChevronUp size={16} /> : <SlidersHorizontal size={16} />}
          Filters
          {activeCount > 0 && (
            <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold bg-brand-100 text-brand-800">
              {activeCount}
            </span>
          )}
        </button>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {open && (
        <div className="sm:hidden mt-3 space-y-3 [&_select]:h-11 [&_input]:h-11">
          {children}
        </div>
      )}

      {/* Desktop: inline row */}
      <div className="hidden sm:flex sm:flex-wrap sm:items-center gap-2">
        {children}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
};
