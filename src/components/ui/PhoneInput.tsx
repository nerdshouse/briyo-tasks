/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useId } from 'react';
import { cn } from '../../lib/cn';

interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'> {
  label?: string;
  error?: string;
}

/**
 * Indian mobile number input with a fixed 🇮🇳 +91 prefix. The value holds just
 * the local digits the person types; normalize with normalizePhoneForStorage
 * before saving.
 */
/** Keep only the 10 local digits: strip non-digits, pasted 91/0 prefixes, cap at 10. */
const sanitizeLocalDigits = (raw: string): string => {
  let d = raw.replace(/\D/g, '');
  while (d.length >= 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
};

export const PhoneInput: React.FC<PhoneInputProps> = ({
  label,
  error,
  className = '',
  id,
  onChange,
  ...props
}) => {
  const fallbackId = useId();
  const inputId = id || props.name || fallbackId;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.target.value = sanitizeLocalDigits(e.target.value);
    onChange?.(e);
  };
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex h-10 w-full items-stretch rounded-control border bg-white transition-colors',
          'focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-500',
          error ? 'border-danger-500' : 'border-slate-200 hover:border-slate-300',
          className
        )}
      >
        <span className="flex items-center gap-1.5 pl-3.5 pr-2.5 text-sm text-slate-600 border-r border-slate-200 select-none whitespace-nowrap">
          <span aria-hidden="true">🇮🇳</span>+91
        </span>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={14}
          id={inputId}
          onChange={handleChange}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
          {...props}
        />
      </div>
      {error && <p className="mt-1.5 text-sm text-danger-600">{error}</p>}
    </div>
  );
};
