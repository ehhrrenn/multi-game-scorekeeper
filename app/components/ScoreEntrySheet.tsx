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
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[100] mx-auto max-w-screen-md rounded-t-2xl border-t-2 border-slate-100 bg-white/95 p-4 pb-24 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] backdrop-blur-md animate-in slide-in-from-bottom-full dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="mb-4">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
            {title}
          </p>
          <div className="rounded-xl border border-slate-100 bg-slate-50 py-3 text-center text-4xl font-black tracking-tight text-blue-600 shadow-inner dark:border-slate-800 dark:bg-slate-950 dark:text-blue-400">
            {displayValue || '-'}
          </div>
          {headerExtra}
          {validationMessage !== undefined && (
            <p
              className={`mt-2 text-center text-sm font-bold ${
                validationMessage ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
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
          className="mt-3 w-full rounded-xl bg-blue-600 py-3.5 text-lg font-bold text-white shadow-md shadow-blue-500/20 transition active:scale-95 disabled:bg-slate-300 disabled:text-slate-400 dark:disabled:bg-slate-800"
        >
          {submitLabel}
        </button>
      </div>
    </>
  );
}
