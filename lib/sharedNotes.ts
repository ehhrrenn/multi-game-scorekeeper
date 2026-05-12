import { doc, onSnapshot, setDoc, type Firestore } from 'firebase/firestore';

export type SharedNoteItem = {
  id: string;
  text: string;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
};

const LOCAL_NOTES_KEY = 'scorekeeper_shared_notes_local_fallback';
const NOTES_COLLECTION = 'Shared';
const NOTES_DOC_ID = 'notes';

export function readLocalSharedNotes(): SharedNoteItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_NOTES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SharedNoteItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

export function writeLocalSharedNotes(notes: SharedNoteItem[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(notes));
}

export function subscribeSharedNotes(
  db: Firestore,
  onChange: (notes: SharedNoteItem[]) => void,
  onError?: (error: unknown) => void
): () => void {
  const notesRef = doc(db, NOTES_COLLECTION, NOTES_DOC_ID);

  return onSnapshot(
    notesRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange([]);
        return;
      }

      const data = snapshot.data() as { items?: SharedNoteItem[] };
      const notes = Array.isArray(data.items) ? data.items : [];
      onChange(notes);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    }
  );
}

export async function saveSharedNotes(db: Firestore, notes: SharedNoteItem[]): Promise<void> {
  const notesRef = doc(db, NOTES_COLLECTION, NOTES_DOC_ID);
  await setDoc(
    notesRef,
    {
      items: notes,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}
