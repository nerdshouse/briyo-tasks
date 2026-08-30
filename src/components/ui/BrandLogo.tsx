/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React from 'react';
import { cn } from '../../lib/cn';

interface BrandLogoProps {
  /** sm: sidebar/header · lg: login/about hero */
  size?: 'sm' | 'lg';
  className?: string;
}

/** The Briyo Supplements wordmark lockup: BRIYO over letter-spaced SUPPLEMENTS. */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'sm', className }) => (
  <span className={cn('inline-flex flex-col items-center leading-none select-none', className)}>
    <span
      className={cn(
        'font-extrabold tracking-tight text-current',
        size === 'lg' ? 'text-4xl' : 'text-xl'
      )}
    >
      BRIYO
    </span>
    <span
      className={cn(
        'font-bold uppercase text-current',
        size === 'lg'
          ? 'text-[11px] tracking-[0.42em] mt-1.5 -mr-[0.42em]'
          : 'text-[6.5px] tracking-[0.34em] mt-0.5 -mr-[0.34em]'
      )}
    >
      Supplements
    </span>
  </span>
);

/** Standard developer credit line. */
export const DeveloperCredit: React.FC<{ className?: string }> = ({ className }) => (
  <p className={cn('text-[11px] leading-relaxed text-slate-400', className)}>
    Developed by <span className="font-medium text-slate-500">Nerdshouse Technologies LLP</span>{' '}
    for <span className="font-medium text-slate-500">Briyo Supplements</span>
  </p>
);
