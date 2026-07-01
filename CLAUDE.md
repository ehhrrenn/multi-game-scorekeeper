# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Commands

- `npm run dev` — start the dev server (Next.js App Router)
- `npm run build` — production build
- `npm run start` — run a production build
- `npm run lint` — ESLint (flat config, `eslint-config-next` core-web-vitals + typescript)
- No test suite exists in this repo.

## Firebase setup

Auth and cloud sync require `NEXT_PUBLIC_FIREBASE_*` env vars (copy `.env.example` to `.env.local`). If any are missing, `lib/firebase.ts` sets `isFirebaseConfigured = false`, `auth`/`db` become `null`, and the app runs in local-only mode (no cloud sign-in/sync) — code that touches Firebase must handle `db`/`auth` being `null`.

## Architecture

This is a scorekeeping app for multiple games (Custom Game, Yahtzee/Triple Yahtzee, Farkle/Farkle Stealing), each with its own route under `app/` (`app/custom`, `app/yahtzee`, `app/farkle`), plus `app/roster`, `app/history`, `app/notes`, and `app/choosy`. `app/components/BottomNav.tsx` and `AuthButton.tsx` are mounted globally in `app/layout.tsx`.

**Persistence model**: state is local-first (`localStorage` via `hooks/useGameState.ts`) and optionally synced to Firestore when a user is signed in. There is no server/API layer — all Firestore reads/writes happen client-side through helpers in `lib/`.

**Active session tracking** (`hooks/useActiveSession.ts`): a single `scorekeeper_active_session` localStorage key (plus a same-tab custom event and cross-tab `storage` event) tracks which game is currently in progress, its `gameType` (`'custom' | 'yahtzee' | 'farkle' | null`), player IDs, and arbitrary `gameState`. `lib/activeGameState.ts` clears the game-type-specific localStorage keys when a session ends.

**Game records** (`lib/gameHistory.ts`) are the canonical shape written to Firestore's `Games` collection (`saveGameRecordToCloud`/`deleteGameRecordFromCloud`) and to game history. A single `GameRecord` type covers all three game types, distinguished by which optional fields are populated (`yahtzeeScores`/`yahtzeeScoreEntries`, `farkleScores`/`farkleMode`/`farkleSettings`, or plain `savedRounds`/`settings` for Custom Game). Key logic lives here:
  - `isGameCompleted` / `withGameLifecycle` — infer/derive `status`, `completedAt`, `completedReason`, `winnerIds` per game type (Yahtzee: all categories filled; Farkle: round-limit or target-score reached; Custom: target/round-limit reached).
  - `buildCustomGameRecord` / `buildYahtzeeGameRecord` / `buildFarkleGameRecord` — turn in-progress session state into a `GameRecord`.
  - `buildYahtzeeGraphSeries` — builds cumulative-score series for charting, preferring ordered `yahtzeeScoreEntries` (append-only log) over reconstructing from the score map when available.

**Game profiles** (`lib/gameProfiles.ts`) represent reusable custom-game configs (win condition, score direction, target/round limit) synced to the `GameProfiles` Firestore collection, and are also derivable from past `GameRecord`s (`buildDerivedProfilesFromHistory`) for games that predate explicit profiles. `BUILT_IN_GAMES` (Custom Game, Yahtzee, Triple Yahtzee, Farkle, Farkle Stealing) are excluded from derived/custom profiles.

**Players**: `lib/cloudPlayers.ts` syncs player profiles to Firestore's `users` collection, with a fallback merge against a legacy `Users` collection (`fetchCloudPlayersWithLegacy`, canonical wins on conflict). `hooks/useAuth.ts` upserts the signed-in user as a cloud player on auth state change and subscribes to their profile doc live.

**Shared notes** (`lib/sharedNotes.ts`) is a single shared Firestore doc (`Shared/notes`) synced live via `onSnapshot`, with a localStorage fallback (`readLocalSharedNotes`/`writeLocalSharedNotes`) when offline/signed-out.

**Scoring logic** for each game lives in `lib/yahtzeeScoring.ts` and `lib/farkleScoring.ts`, separate from the record-building/persistence logic in `gameHistory.ts`.

Path alias `@/*` maps to the repo root (see `tsconfig.json`).
