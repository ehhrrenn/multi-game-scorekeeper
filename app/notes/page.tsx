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
    <main className="min-h-screen newsprint-page pb-32 text-black animate-in fade-in slide-in-from-bottom-2">
      <div className="sticky top-0 z-40 border-b border-black/20 bg-[#f8f8f5]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-screen-md items-center justify-between px-4">
          <h1 className="text-2xl font-black text-[#111] [font-family:Georgia,'Times_New_Roman',serif]">Shared Notes</h1>
          <span className="border border-black/20 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-black/70">
            {remainingCount} Remaining
          </span>
        </div>
      </div>

      <section className="mx-auto max-w-screen-md p-4">
        <div className="mb-4 border border-black/20 bg-[#f6f6f2] p-4">
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-black/55">Add Shared Note</label>
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
              className="flex-1 border border-black/20 bg-white px-3 py-2.5 font-bold text-black outline-none focus:border-black"
            />
            <button
              onClick={() => void addNote()}
              className="border border-black/30 bg-black px-4 font-black uppercase tracking-[0.08em] text-white transition-colors active:bg-white active:text-black"
            >
              Add
            </button>
          </div>
        </div>

        {loading ? (
          <div className="border border-black/20 bg-white p-6 text-center font-bold text-black/60">
            Loading shared notes...
          </div>
        ) : notes.length === 0 ? (
          <div className="border border-dashed border-black/30 bg-[#efefe9] p-8 text-center font-bold text-black/60">
            No notes yet. Add one for everyone.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="flex items-center gap-3 border border-black/20 bg-white p-3"
              >
                <button
                  onClick={() => void toggleNote(note.id)}
                  className={`flex h-8 w-8 items-center justify-center border text-sm font-black transition-colors active:bg-black active:text-white ${note.checked ? 'border-black bg-black text-white' : 'border-black/25 bg-[#f6f6f2] text-transparent'}`}
                >
                  ✓
                </button>
                <p className={`flex-1 font-bold ${note.checked ? 'text-black/40 line-through' : 'text-black'}`}>
                  {note.text}
                </p>
                <button
                  onClick={() => void deleteNote(note.id)}
                  className="h-9 w-9 border border-black/20 bg-[#ecece7] text-black font-black transition-colors active:bg-black active:text-white"
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
