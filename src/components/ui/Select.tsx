/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  className = '',
  id,
  children,
  ...props
}) => {
  const fallbackId = useId();
  const selectId = id || props.name || fallbackId;
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'flex h-10 w-full appearance-none rounded-control border bg-white pl-3.5 pr-9 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:opacity-50 transition-colors cursor-pointer',
            error ? 'border-danger-500' : 'border-slate-200 hover:border-slate-300',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
      {error && <p className="mt-1.5 text-sm text-danger-600">{error}</p>}
    </div>
  );
};
