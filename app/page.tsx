// app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <main className="p-6 min-h-screen">
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-black text-slate-800">Ready to play?</h1>
        <p className="text-slate-500 mt-1">Select a game module to get started.</p>
      </header>

      <div className="grid gap-4">
        
        {/* Custom Tracker Card */}
        <Link href="/custom" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 active:scale-[0.98] transition-transform">
          <div className="bg-blue-100 w-16 h-16 rounded-xl flex items-center justify-center text-3xl">
            📝
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Custom Game</h2>
            <p className="text-slate-500 text-sm">Round-based grid scoring.</p>
          </div>
        </Link>

        {/* Farkle Card (Coming Soon) */}
        <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 flex items-center gap-4 opacity-60">
          <div className="bg-slate-200 w-16 h-16 rounded-xl flex items-center justify-center text-3xl pb-1">
            🌶️
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Farkle</h2>
            <p className="text-slate-500 text-sm">Point banking & risk tracking.</p>
          </div>
        </div>

        {/* Yahtzee Card (Coming Soon) */}
        <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 flex items-center gap-4 opacity-60">
          <div className="bg-slate-200 w-16 h-16 rounded-xl flex items-center justify-center text-3xl pb-1">
            🎲
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Yahtzee</h2>
            <p className="text-slate-500 text-sm">Classic auto-calculating grid.</p>
          </div>
        </div>

      </div>
    </main>
  );
}