// app/offline/page.tsx
//
// Fallback shown by the service worker (public/sw.js) when a page
// navigation fails and nothing matching was already cached.
'use client';

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[#f6f6f2] text-[#111] flex flex-col items-center justify-center px-6 text-center newsprint-page">
      <h1 className="text-3xl font-black tracking-tight leading-tight [font-family:Georgia,'Times_New_Roman',serif]">
        You&rsquo;re offline
      </h1>
      <p className="mt-3 max-w-sm text-sm text-black/70">
        This page hasn&rsquo;t been loaded yet, so it isn&rsquo;t saved for offline use.
        Games already open will keep scoring fine &mdash; reconnect and revisit
        each page once to make it available offline too.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 px-5 py-2.5 bg-[#111] text-[#f6f6f2] text-sm font-bold uppercase tracking-wider rounded-full active:scale-95 transition-transform"
      >
        Try again
      </button>
    </main>
  );
}
