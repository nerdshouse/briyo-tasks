/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useId } from 'react';
import { cn } from '../../lib/cn';

interface DateInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const DateInput: React.FC<DateInputProps> = ({
  label,
  error,
  className = '',
  id,
  ...props
}) => {
  const fallbackId = useId();
  const inputId = id || props.name || fallbackId;
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <input
        type="date"
        id={inputId}
        className={cn(
          'flex h-10 w-full rounded-control border bg-white px-3.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:opacity-50 transition-colors',
          error ? 'border-danger-500' : 'border-slate-200 hover:border-slate-300',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1.5 text-sm text-danger-600">{error}</p>}
    </div>
  );
};
