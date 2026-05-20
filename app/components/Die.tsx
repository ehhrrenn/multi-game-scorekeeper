// app/components/Die.tsx
'use client';

import React from 'react';

type PipPosition = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

const PIP_LAYOUTS: Record<number, PipPosition[]> = {
  1: ['mc'],
  2: ['tr', 'bl'],
  3: ['tr', 'mc', 'bl'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'mc', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

const PIP_STYLE: Record<PipPosition, React.CSSProperties> = {
  tl: { top: '14%', left: '14%' },
  tc: { top: '14%', left: '50%', transform: 'translateX(-50%)' },
  tr: { top: '14%', right: '14%' },
  ml: { top: '50%', left: '14%', transform: 'translateY(-50%)' },
  mc: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  mr: { top: '50%', right: '14%', transform: 'translateY(-50%)' },
  bl: { bottom: '14%', left: '14%' },
  bc: { bottom: '14%', left: '50%', transform: 'translateX(-50%)' },
  br: { bottom: '14%', right: '14%' },
};

type Props = {
  value: number;
  held: boolean;
  locked?: boolean;
  animating?: boolean;
  onClick?: () => void;
  disabled?: boolean;
};

export default function Die({ value, held, locked = false, animating = false, onClick, disabled = false }: Props) {
  const pips = PIP_LAYOUTS[value] ?? [];

  const bgClass = held
    ? locked
      ? 'bg-amber-200 dark:bg-amber-700 border-amber-400 dark:border-amber-500'
      : 'bg-amber-300 dark:bg-amber-600 border-amber-500 dark:border-amber-400'
    : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-500';

  const pipClass = held
    ? 'bg-amber-800 dark:bg-amber-200'
    : 'bg-slate-800 dark:bg-slate-100';

  const sizeClass = 'w-14 h-14';
  const pipSize = 'w-2.5 h-2.5';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled && !onClick}
      aria-label={`Die showing ${value}${held ? ', held' : ''}`}
      className={[
        'relative rounded-xl border-2 shadow-md transition-all select-none',
        sizeClass,
        bgClass,
        animating ? 'animate-die-roll' : '',
        !disabled && onClick ? 'active:scale-90 cursor-pointer' : 'cursor-default',
        locked ? 'opacity-75' : '',
      ].join(' ')}
    >
      {pips.map((pos, i) => (
        <span
          key={i}
          className={`absolute rounded-full ${pipSize} ${pipClass}`}
          style={PIP_STYLE[pos]}
        />
      ))}
      {held && !locked && (
        <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center shadow">
          ✓
        </span>
      )}
    </button>
  );
}
