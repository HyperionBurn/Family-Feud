// Moderator-local saving. Everything here lives in this browser only; it is not a cloud backup.
import type { Buzzers, Pairing } from "../buzzers/buzzers";
import { validatePack } from "../content/schema";
import type { Pack } from "../content/types";
import { initialSession } from "../engine/reducer";
import type { Phase, Session } from "../engine/types";

export const KEYS = {
  pack: "ff.pack.v1",
  packBackup: "ff.pack.backup.v1",
  session: "ff.session.v1",
  probe: "ff.probe.v1",
  buzzers: "ff.buzzers.v2",
  pairs: "ff.pairs.v1",
  guide: "ff.guide.v1",
} as const;

/** Physical standalone buzzers judged by the hosts (default), or one assigned phone per team. */
export type BuzzerMode = "physical" | "phone";
export const loadBuzzerMode = (): BuzzerMode => (readJson(KEYS.buzzers) === "phone" ? "phone" : "physical");
export const saveBuzzerMode = (m: BuzzerMode): WriteResult => writeJson(KEYS.buzzers, m);

/** Phone pairings survive a console refresh so paired phones keep working; an open press window never does. */
export function loadPairs(): Buzzers | null {
  const raw = readJson(KEYS.pairs);
  if (!isObj(raw) || !isObj(raw.pairs) || typeof raw.wrongCodes !== "number") return null;
  const ok = (p: unknown): p is Pairing => isObj(p) && typeof p.code === "string" && typeof p.gen === "number" && (p.token === null || typeof p.token === "string") && (p.actorId === null || typeof p.actorId === "string");
  return ok(raw.pairs.A) && ok(raw.pairs.B) ? { pairs: { A: raw.pairs.A, B: raw.pairs.B }, wrongCodes: raw.wrongCodes, arm: null } : null;
}
export const savePairs = (b: Buzzers): WriteResult => writeJson(KEYS.pairs, { pairs: b.pairs, wrongCodes: b.wrongCodes });

/** The quick guide was finished or skipped on this laptop. */
export const guideSeen = (): boolean => readJson(KEYS.guide) !== null;
export const markGuideSeen = (how: "done" | "skipped"): WriteResult => writeJson(KEYS.guide, how);

export type WriteResult = { ok: true; at: number } | { ok: false; error: string };

export function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): WriteResult {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true, at: Date.now() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Keep a recoverable copy of the current pack before it is replaced. */
export function savePack(next: Pack, previous: Pack | null): WriteResult {
  if (previous) writeJson(KEYS.packBackup, previous);
  return writeJson(KEYS.pack, next);
}

export function loadPack(): Pack | null {
  const raw = readJson(KEYS.pack);
  if (!raw) return null;
  const r = validatePack(raw);
  return r.ok ? r.pack : null;
}

export function loadBackupPack(): Pack | null {
  const raw = readJson(KEYS.packBackup);
  const r = raw ? validatePack(raw) : null;
  return r?.ok ? r.pack : null;
}

const PHASES: Phase[] = ["lobby", "intro", "board_ready", "face_off", "play_or_pass", "team_turn", "steal", "round_over", "match_over"];
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Structural check for a saved or imported session. Never throws. */
export function parseSession(raw: unknown): Session | null {
  if (!isObj(raw) || !isObj(raw.state) || !Array.isArray(raw.history)) return null;
  const s = raw.state;
  const t = s.teams;
  if (!PHASES.includes(s.phase as Phase) || !isObj(t) || !isObj(t.A) || !isObj(t.B)) return null;
  if (!isNum(t.A.score) || !isNum(t.B.score) || typeof t.A.name !== "string" || typeof t.B.name !== "string") return null;
  if (!isNum(s.roundsPlayed) || !isNum(s.totalRounds) || !Array.isArray(s.playedQuestionIds) || !Array.isArray(s.seen)) return null;
  if (s.round !== null) {
    const r = s.round;
    if (!isObj(r) || !Array.isArray(r.answers) || !Array.isArray(r.revealed) || !isNum(r.pot) || !isNum(r.strikes)) return null;
  }
  return raw as unknown as Session;
}

export interface SavedSession {
  packId: string;
  savedAt: number;
  session: Session;
  /** The arcade hub round this game belongs to, when the hub launched it. */
  arcadeRound?: string;
}

export function loadSession(): SavedSession | null {
  const raw = readJson(KEYS.session);
  if (!isObj(raw)) return null;
  const session = parseSession(raw.session);
  return session && typeof raw.packId === "string"
    ? { packId: raw.packId, savedAt: Number(raw.savedAt) || 0, session, arcadeRound: typeof raw.arcadeRound === "string" ? raw.arcadeRound : undefined }
    : null;
}

export const saveSession = (packId: string, session: Session, arcadeRound?: string): WriteResult =>
  writeJson(KEYS.session, { packId, savedAt: Date.now(), session, ...(arcadeRound ? { arcadeRound } : {}) });

export const hasProgress = (s: Session): boolean =>
  s.state.roundsPlayed > 0 || s.state.round !== null || s.state.teams.A.score !== 0 || s.state.teams.B.score !== 0;

export interface Backup {
  kind: "gdg-ff-session-backup";
  version: 1;
  exportedAt: string;
  pack: Pack;
  session: Session;
}

export const makeBackup = (pack: Pack, session: Session): Backup => ({
  kind: "gdg-ff-session-backup",
  version: 1,
  exportedAt: new Date().toISOString(),
  pack,
  session,
});

/** Validate a backup file completely before anything is replaced. */
export function parseBackup(text: string): { ok: true; pack: Pack; session: Session } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["File is not valid JSON."] };
  }
  if (!isObj(raw) || raw.kind !== "gdg-ff-session-backup" || raw.version !== 1) {
    return { ok: false, errors: ["Not a Family Feud session backup."] };
  }
  const p = validatePack(raw.pack);
  if (!p.ok) return { ok: false, errors: p.errors.map((e) => `pack: ${e}`) };
  const session = parseSession(raw.session);
  if (!session) return { ok: false, errors: ["session: saved game state is malformed."] };
  return { ok: true, pack: p.pack, session };
}

export const freshSession = initialSession;

export function download(filename: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
