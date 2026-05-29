// app/components/ScoreEntrySheet.tsx
'use client';

import React from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  displayValue: string;
  /** undefined = hide validation row; null = show green "valid" label; string = show red error */
  validationMessage?: string | null;
  validLabel?: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
  submitLabel?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
};

export default function ScoreEntrySheet({
  open,
  onClose,
  title,
  displayValue,
  validationMessage,
  validLabel = 'Valid',
  onSubmit,
  submitDisabled = false,
  submitLabel = 'Enter Score',
  headerExtra,
  children,
}: Props) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[90] bg-black/45"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[100] mx-auto max-w-screen-md border-x border-t border-black/30 bg-[#f7f7f2] p-4 pb-24 text-black shadow-[0_-10px_30px_rgba(0,0,0,0.22)] animate-in slide-in-from-bottom-full">
        <div className="mb-4">
          <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-black/65">
            {title}
          </p>
          <div className="border border-black/25 bg-white py-3 text-center text-4xl font-black tracking-tight text-black shadow-inner">
            {displayValue || '-'}
          </div>
          {headerExtra}
          {validationMessage !== undefined && (
            <p
              className={`mt-2 text-center text-sm font-bold ${
                validationMessage ? 'text-black' : 'text-black/70'
              }`}
            >
              {validationMessage || validLabel}
            </p>
          )}
        </div>

        {children}

        <button
          onClick={onSubmit}
          disabled={submitDisabled}
          className="mt-3 w-full border border-black/30 bg-black px-4 py-3.5 text-lg font-black uppercase tracking-[0.08em] text-white transition-colors active:bg-white active:text-black disabled:border-black/15 disabled:bg-[#d9d9d3] disabled:text-black/40"
        >
          {submitLabel}
        </button>
      </div>
    </>
  );
}
