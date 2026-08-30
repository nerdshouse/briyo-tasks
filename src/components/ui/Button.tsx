/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading,
  className = '',
  disabled,
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center rounded-control font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-sm',
  };
  const variants = {
    primary:
      'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500 shadow-sm shadow-brand-600/20',
    secondary:
      'bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-300 border border-slate-200',
    danger:
      'bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-500 shadow-sm shadow-danger-600/20',
    success:
      'bg-success-600 text-white hover:bg-success-700 focus:ring-success-500 shadow-sm shadow-success-600/20',
    ghost: 'text-slate-600 hover:bg-slate-100 focus:ring-slate-300',
  };
  return (
    <button
      className={cn(base, sizes[size], variants[variant], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner className="-ml-1 mr-2" />
          Processing...
        </>
      ) : (
        children
      )}
    </button>
  );
};
