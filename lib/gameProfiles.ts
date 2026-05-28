import { collection, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import type { GameRecord } from './gameHistory';

export type WinCondition = 'HIGH' | 'LOW';
export type ScoreDirection = 'UP' | 'DOWN';
export type EndMode = 'TARGET' | 'ROUNDS';

export type GameProfile = {
  name: string;
  winCondition: WinCondition;
  scoreDirection: ScoreDirection;
  endMode: EndMode;
  target: number;
  roundLimit: number;
  createdAt: string;
  lastModified: string;
};

const BUILT_IN_GAMES = new Set(['Custom Game', 'Yahtzee', 'Triple Yahtzee', 'Farkle', 'Farkle Stealing']);

function nowIso(): string {
  return new Date().toISOString();
}

export const DEFAULT_GAME_PROFILE: GameProfile = {
  name: 'Custom Game',
  winCondition: 'HIGH',
  scoreDirection: 'UP',
  endMode: 'TARGET',
  target: 0,
  roundLimit: 0,
  createdAt: '',
  lastModified: ''
};

export function normalizeProfileName(name: string | undefined | null): string {
  return (name || '').trim().replace(/\s+/g, ' ');
}

function normalizeWinCondition(value: unknown): WinCondition {
  return value === 'LOW' ? 'LOW' : 'HIGH';
}

function normalizeScoreDirection(value: unknown): ScoreDirection {
  return value === 'DOWN' ? 'DOWN' : 'UP';
}

function normalizeEndMode(value: unknown): EndMode {
  return value === 'ROUNDS' ? 'ROUNDS' : 'TARGET';
}

function normalizePositiveInt(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function normalizeGameProfile(input: Partial<GameProfile> & { name?: string }): GameProfile {
  const name = normalizeProfileName(input.name);
  const createdAt = typeof input.createdAt === 'string' ? input.createdAt : '';
  const lastModified = typeof input.lastModified === 'string' ? input.lastModified : '';

  return {
    name: name || DEFAULT_GAME_PROFILE.name,
    winCondition: normalizeWinCondition(input.winCondition),
    scoreDirection: normalizeScoreDirection(input.scoreDirection),
    endMode: normalizeEndMode(input.endMode),
    target: normalizePositiveInt(input.target),
    roundLimit: normalizePositiveInt(input.roundLimit),
    createdAt,
    lastModified
  };
}

function getProfileKey(name: string): string {
  return normalizeProfileName(name).toLowerCase();
}

function compareProfilesForSort(a: GameProfile, b: GameProfile): number {
  return a.name.localeCompare(b.name);
}

export function dedupeGameProfiles(profiles: Array<Partial<GameProfile> & { name?: string }>): GameProfile[] {
  const profileByName = new Map<string, GameProfile>();

  for (const rawProfile of profiles) {
    const normalized = normalizeGameProfile(rawProfile);
    if (!normalized.name) {
      continue;
    }

    const key = getProfileKey(normalized.name);
    const existing = profileByName.get(key);
    if (!existing) {
      profileByName.set(key, normalized);
      continue;
    }

    const existingStamp = existing.lastModified || existing.createdAt || '';
    const incomingStamp = normalized.lastModified || normalized.createdAt || '';
    profileByName.set(key, incomingStamp >= existingStamp ? normalized : existing);
  }

  if (!profileByName.has(getProfileKey(DEFAULT_GAME_PROFILE.name))) {
    profileByName.set(getProfileKey(DEFAULT_GAME_PROFILE.name), normalizeGameProfile(DEFAULT_GAME_PROFILE));
  }

  return Array.from(profileByName.values()).sort(compareProfilesForSort);
}

export function isBuiltInGameName(name: string): boolean {
  return BUILT_IN_GAMES.has(normalizeProfileName(name));
}

export function deriveGameProfileFromRecord(record: GameRecord): GameProfile | null {
  const name = normalizeProfileName(record.gameName);
  if (!name || isBuiltInGameName(name)) {
    return null;
  }

  const settings = record.settings;
  return normalizeGameProfile({
    name,
    winCondition: record.winCondition || (settings?.scoreDirection === 'DOWN' ? 'LOW' : 'HIGH'),
    scoreDirection: settings?.scoreDirection || (record.winCondition === 'LOW' ? 'DOWN' : 'UP'),
    endMode: settings?.endMode || 'TARGET',
    target: settings?.target || 0,
    roundLimit: settings?.roundLimit || 0,
    createdAt: record.date,
    lastModified: record.completedAt || record.date
  });
}

export function buildDerivedProfilesFromHistory(records: GameRecord[]): GameProfile[] {
  return dedupeGameProfiles(records.map((record) => deriveGameProfileFromRecord(record)).filter(Boolean) as GameProfile[]);
}

function toProfileDocId(name: string): string {
  const normalized = getProfileKey(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `profile_${normalized || 'custom'}`;
}

export async function fetchCloudGameProfiles(db: Firestore): Promise<GameProfile[]> {
  const snapshot = await getDocs(collection(db, 'GameProfiles'));
  const rawProfiles = snapshot.docs.map((snap) => {
    const raw = snap.data() as Partial<GameProfile>;
    return normalizeGameProfile({ ...raw, name: raw.name || snap.id.replace(/^profile_/, '') });
  });

  return dedupeGameProfiles(rawProfiles);
}

export async function upsertCloudGameProfile(db: Firestore, profile: GameProfile): Promise<void> {
  const normalized = normalizeGameProfile(profile);
  const payload: GameProfile = {
    ...normalized,
    createdAt: normalized.createdAt || nowIso(),
    lastModified: normalized.lastModified || nowIso()
  };

  await setDoc(
    doc(db, 'GameProfiles', toProfileDocId(payload.name)),
    payload,
    { merge: true }
  );
}

export async function upsertCloudGameProfiles(db: Firestore, profiles: GameProfile[]): Promise<void> {
  const normalizedProfiles = dedupeGameProfiles(profiles);
  await Promise.all(normalizedProfiles.map((profile) => upsertCloudGameProfile(db, profile)));
}
