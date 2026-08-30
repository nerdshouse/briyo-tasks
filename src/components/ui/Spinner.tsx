/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React from 'react';
import { cn } from '../../lib/cn';

interface SpinnerProps {
  size?: 'sm' | 'md';
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'sm', className }) => (
  <svg
    className={cn('animate-spin', size === 'sm' ? 'h-4 w-4' : 'h-8 w-8', className)}
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
    />
  </svg>
);
