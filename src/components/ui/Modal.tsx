/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

/* Ref-counted body scroll lock so stacked modals don't fight over it. */
let lockCount = 0;
const lockBodyScroll = () => {
  if (++lockCount === 1) document.body.style.overflow = 'hidden';
};
const unlockBodyScroll = () => {
  if (--lockCount <= 0) {
    lockCount = 0;
    document.body.style.overflow = '';
  }
};

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: keyof typeof SIZES;
  closeOnBackdrop?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes for the panel (e.g. p-0 layouts). */
  panelClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  size = 'md',
  closeOnBackdrop = true,
  footer,
  children,
  panelClassName,
}) => {
  const backdropMouseDown = useRef(false);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      unlockBodyScroll();
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm p-4 grid place-items-center overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        backdropMouseDown.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (closeOnBackdrop && backdropMouseDown.current && e.target === e.currentTarget) {
          onClose();
        }
        backdropMouseDown.current = false;
      }}
    >
      <div
        className={cn(
          'bg-white rounded-card shadow-overlay w-full max-h-[90dvh] overflow-y-auto flex flex-col',
          SIZES[size],
          panelClassName
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-control text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
