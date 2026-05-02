import { collection, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';

export const USERS_COLLECTION = 'users';
const LEGACY_USERS_COLLECTION = 'Users';

export type SyncedPlayer = {
  id: string;
  name: string;
  emoji: string;
  photoURL?: string;
  useCustomEmoji?: boolean;
  isCloudUser?: boolean;
  isGuest?: boolean;
  isAuthUser?: boolean;
  createdAt?: string;
  lastModified?: string;
  lastLogin?: string;
};

export function formatFirstName(name: string | undefined | null): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Unknown';
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens[0] || trimmed;
}

function normalizePlayer(id: string, raw: Record<string, unknown>, cloudFlag = true): SyncedPlayer {
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Unknown';
  const emoji = typeof raw.emoji === 'string' && raw.emoji.trim() ? raw.emoji : '👤';

  return {
    id,
    name,
    emoji,
    photoURL: typeof raw.photoURL === 'string' && raw.photoURL ? raw.photoURL : undefined,
    useCustomEmoji: Boolean(raw.useCustomEmoji),
    isCloudUser: cloudFlag,
    isGuest: Boolean(raw.isGuest),
    isAuthUser: Boolean(raw.isAuthUser),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    lastModified: typeof raw.lastModified === 'string' ? raw.lastModified : undefined,
    lastLogin: typeof raw.lastLogin === 'string' ? raw.lastLogin : undefined
  };
}

export function mergePlayersById<T extends { id: string }>(...lists: T[][]): T[] {
  const map = new Map<string, T>();
  for (const list of lists) {
    for (const item of list) {
      if (!item?.id) continue;
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export async function fetchCloudPlayersWithLegacy(db: Firestore): Promise<SyncedPlayer[]> {
  const [canonicalResult, legacyResult] = await Promise.allSettled([
    getDocs(collection(db, USERS_COLLECTION)),
    getDocs(collection(db, LEGACY_USERS_COLLECTION))
  ]);

  const canonicalPlayers = canonicalResult.status === 'fulfilled'
    ? canonicalResult.value.docs.map((snap) => normalizePlayer(snap.id, snap.data() as Record<string, unknown>, true))
    : [];

  const legacyPlayers = legacyResult.status === 'fulfilled'
    ? legacyResult.value.docs.map((snap) => normalizePlayer(snap.id, snap.data() as Record<string, unknown>, true))
    : [];

  if (!canonicalPlayers.length && !legacyPlayers.length && canonicalResult.status === 'rejected' && legacyResult.status === 'rejected') {
    return [];
  }

  // Canonical collection wins when both exist.
  return mergePlayersById(legacyPlayers, canonicalPlayers);
}

export async function upsertCloudPlayer(db: Firestore, player: SyncedPlayer): Promise<void> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id: player.id,
    name: player.name || 'Unknown',
    emoji: player.emoji || '👤',
    photoURL: player.photoURL || '',
    useCustomEmoji: Boolean(player.useCustomEmoji),
    isCloudUser: true,
    isGuest: Boolean(player.isGuest),
    isAuthUser: Boolean(player.isAuthUser),
    createdAt: player.createdAt || now,
    lastModified: now
  };

  if (player.lastLogin) {
    payload.lastLogin = player.lastLogin;
  }

  await setDoc(
    doc(db, USERS_COLLECTION, player.id),
    payload,
    { merge: true }
  );
}

export function createGuestPlayerId(): string {
  return `guest_${Date.now()}`;
}
