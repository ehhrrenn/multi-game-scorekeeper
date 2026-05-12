'use client';

import { useEffect, useMemo, useState } from 'react';
import BottomNav from '../components/BottomNav';
import { db } from '../../lib/firebase';
import {
  readLocalSharedNotes,
  saveSharedNotes,
  subscribeSharedNotes,
  type SharedNoteItem,
  writeLocalSharedNotes,
} from '../../lib/sharedNotes';

export default function NotesPage() {
  const [notes, setNotes] = useState<SharedNoteItem[]>(() => (db ? [] : readLocalSharedNotes()));
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(Boolean(db));

  useEffect(() => {
    if (!db) {
      return;
    }

    const unsubscribe = subscribeSharedNotes(
      db,
      (nextNotes) => {
        setNotes(nextNotes);
        writeLocalSharedNotes(nextNotes);
        setLoading(false);
      },
      (error) => {
        console.error('Error syncing shared notes:', error);
        setNotes(readLocalSharedNotes());
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const remainingCount = useMemo(() => notes.filter((note) => !note.checked).length, [notes]);

  const persist = async (nextNotes: SharedNoteItem[]) => {
    setNotes(nextNotes);
    writeLocalSharedNotes(nextNotes);

    if (!db) {
      return;
    }

    try {
      await saveSharedNotes(db, nextNotes);
    } catch (error) {
      console.error('Error saving shared notes:', error);
    }
  };

  const addNote = async () => {
    const trimmed = newNote.trim();
    if (!trimmed) {
      return;
    }

    const now = new Date().toISOString();
    const note: SharedNoteItem = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: trimmed,
      checked: false,
      createdAt: now,
      updatedAt: now,
    };

    await persist([note, ...notes]);
    setNewNote('');
  };

  const toggleNote = async (noteId: string) => {
    const now = new Date().toISOString();
    const next = notes.map((note) =>
      note.id === noteId
        ? { ...note, checked: !note.checked, updatedAt: now }
        : note
    );
    await persist(next);
  };

  const deleteNote = async (noteId: string) => {
    await persist(notes.filter((note) => note.id !== noteId));
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 pb-32 transition-colors">
      <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-screen-md mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-black">Shared Notes</h1>
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full text-xs font-bold shadow-inner border border-slate-200 dark:border-slate-700">
            {remainingCount} Remaining
          </span>
        </div>
      </div>

      <section className="max-w-screen-md mx-auto p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm mb-4">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Add Shared Note</label>
          <div className="flex gap-2">
            <input
              value={newNote}
              onChange={(event) => setNewNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void addNote();
                }
              }}
              placeholder="Milk, score sheets, snacks..."
              className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            />
            <button
              onClick={() => void addNote()}
              className="bg-blue-600 text-white px-4 rounded-xl font-black shadow-sm active:scale-95 transition-all"
            >
              Add
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center text-slate-500 dark:text-slate-400 font-medium">
            Loading shared notes...
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-8 text-center text-slate-500 dark:text-slate-400 font-medium">
            No notes yet. Add one for everyone.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm flex items-center gap-3"
              >
                <button
                  onClick={() => void toggleNote(note.id)}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-black transition-all active:scale-95 ${note.checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600 text-transparent'}`}
                >
                  ✓
                </button>
                <p className={`flex-1 font-bold ${note.checked ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                  {note.text}
                </p>
                <button
                  onClick={() => void deleteNote(note.id)}
                  className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 font-black active:scale-95 transition-all"
                  aria-label="Delete note"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
