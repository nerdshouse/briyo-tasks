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

/**
 * The Briyo Supplements wordmark lockup: heavy BRIYO with SUPPLEMENTS
 * justified edge-to-edge beneath it, matching the brand logo. The second
 * line's letters are flex-justified so it always spans exactly the width
 * the BRIYO line sets, at any size.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'sm', className }) => (
  <span className={cn('inline-flex flex-col leading-none select-none', className)}>
    <span
      className={cn(
        'font-extrabold tracking-[0.03em] -mr-[0.03em] text-current',
        size === 'lg' ? 'text-4xl' : 'text-xl'
      )}
    >
      BRIYO
    </span>
    <span
      aria-label="Supplements"
      className={cn(
        'flex justify-between font-extrabold uppercase text-current',
        size === 'lg' ? 'text-[13px] mt-1' : 'text-[7px] mt-0.5'
      )}
    >
      {'SUPPLEMENTS'.split('').map((c, i) => (
        <span key={i} aria-hidden="true">
          {c}
        </span>
      ))}
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
