import { useAirJamHost } from "@air-jam/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PENDING_PACK } from "../content/canonical";
import { validatePack } from "../content/schema";
import type { Pack, Question } from "../content/types";
import { apply, initialSession } from "../engine/reducer";
import type { Action, Session, TeamId } from "../engine/types";
import { clearArm, closeBuzzers, initialBuzzers, openBuzzers, pair, press, publicBuzzers, resetPairing, type Buzzers } from "../buzzers/buzzers";
import { buzzerHandlers, publishSnapshot, useFeudStore } from "../game/store";
import { HEARTBEAT_MS, STALE_AFTER_MS, openChannel, type ScreenSound } from "../public/channel";
import { projectPublic } from "../public/project";
import type { PublicSnapshot, RelayStatus } from "../public/types";
import { currentLaunch } from "../arcade/launch";
import { arcadeSession } from "../arcade/session";
import { newId } from "../util/id";
import { KEYS, freshSession, hasProgress, loadBackupPack, loadBuzzerMode, loadPack, loadPairs, loadSession, saveBuzzerMode, savePairs, saveSession, savePack, writeJson, type BuzzerMode, type SavedSession, type WriteResult } from "./persist";

// crypto.getRandomValues works on a plain-http LAN address too, unlike randomUUID.
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

type UndoAction = { id: string; type: "UNDO" };
type HostAction = Action | UndoAction | { id: string; type: "LOAD"; session: Session };

const reduce = (s: Session, a: HostAction): Session => (a.type === "LOAD" ? a.session : apply(s, a));

export type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type Intent = DistributiveOmit<Action, "id"> | { type: "UNDO" };

const STRIKE_COOLDOWN_MS = 700; // a double click is one strike; a deliberate second one comes later

export function useHostGame() {
  const host = useAirJamHost();
  // Calling the store hook mounts the SDK's host binding: state sync out to phones, buzzer presses in.
  useFeudStore.useActions();
  // Set only when the arcade hub launched this console. Everything arcade-related is inert without it.
  const arcade = useMemo(() => currentLaunch(), []);
  const [pack, setPack] = useState<Pack>(() => loadPack() ?? structuredClone(PENDING_PACK));
  const [session, setSession] = useState<Session>(() => (arcade ? arcadeSession(arcade, loadSession()?.session ?? null) : initialSession()));
  const [resumeOffer, setResumeOffer] = useState<SavedSession | null>(() => {
    const s = loadSession();
    // A game from an earlier hub round is history, not something to resume; a reload of this round's console is.
    return s && hasProgress(s.session) && (!arcade || s.arcadeRound === arcade.round) ? s : null;
  });
  // A probe write at start so a broken browser store is visible straight away, not at the first save.
  const [saveStatus, setSaveStatus] = useState<WriteResult | null>(() => writeJson(KEYS.probe, 1));
  const sessionRef = useRef(session);
  const packRef = useRef(pack);
  const holdSave = useRef(resumeOffer !== null); // do not overwrite the saved match before the host chooses
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null);
  const [timer, setTimer] = useState<{ endsAt: number; durationMs: number } | null>(null);
  const [buzzerMode, setBuzzerModeState] = useState<BuzzerMode>(() => loadBuzzerMode());
  // What the projector window last reported about itself, and when.
  const [screen, setScreen] = useState<{ sound: ScreenSound; at: number } | null>(null);
  const [clock, setClock] = useState(Date.now());

  // -- room (only shown in phone-buzzer mode) --------------------------------
  const relay: RelayStatus = host.connectionStatus === "connected" && host.roomId ? "ready" : host.connectionStatus === "connecting" || host.connectionStatus === "idle" ? "connecting" : "offline";
  const phoneMode = buzzerMode === "phone";
  const room = useMemo(
    () => ({ code: phoneMode && relay === "ready" ? host.roomId : null, joinUrl: phoneMode && relay === "ready" ? host.joinUrl || null : null, status: relay, connected: host.players.length, capacity: 16 }),
    [phoneMode, relay, host.roomId, host.joinUrl, host.players.length],
  );

  // -- phone buzzers: pairings are saved, an open press window is not -------
  const [buzzers, setBuzzers] = useState<Buzzers>(() => loadPairs() ?? initialBuzzers(rand));
  const buzzersRef = useRef(buzzers);
  const commitBuzzers = useCallback((next: Buzzers) => {
    if (next === buzzersRef.current) return;
    buzzersRef.current = next;
    setBuzzers(next);
    savePairs(next);
  }, []);
  const setBuzzerMode = (m: BuzzerMode) => {
    saveBuzzerMode(m);
    setBuzzerModeState(m);
    commitBuzzers(clearArm(buzzersRef.current)); // presses meant for the old mode can never land
  };

  // -- saving: after every meaningful host action, never from an effect --------
  const commit = useCallback((next: Session) => {
    const prev = sessionRef.current.state;
    // Any change to the round (a buzz, a reveal, a strike, an undo) ends a running countdown: it belonged to the last moment.
    if (next.state.round !== prev.round || next.state.phase !== prev.phase) setTimer(null);
    // A new phase or a new round voids any open phone-buzzer window. A buzz within the face-off keeps it, for its timing.
    if (next.state.phase !== prev.phase || next.state.round?.roundId !== prev.round?.roundId) commitBuzzers(clearArm(buzzersRef.current));
    sessionRef.current = next;
    setSession(next);
    if (!holdSave.current) setSaveStatus(saveSession(packRef.current.packId, next, arcade?.round));
  }, [commitBuzzers, arcade]);
  const updatePack = useCallback((next: Pack) => {
    setSaveStatus(savePack(next, packRef.current)); // the pack being replaced is kept as a recoverable copy
    packRef.current = next;
    setPack(next);
  }, []);

  const resume = () => {
    holdSave.current = false;
    if (resumeOffer) commit(resumeOffer.session);
    setResumeOffer(null);
    setNotice(resumeOffer ? "Saved match restored." : null);
  };
  const startFresh = () => {
    holdSave.current = false;
    commit(arcade ? arcadeSession(arcade, resumeOffer?.session ?? null) : freshSession());
    setResumeOffer(null);
  };

  // -- engine ----------------------------------------------------------------
  const lastStrike = useRef(0);
  const [undone, setUndone] = useState(false);
  const act = useCallback((intent: Intent) => {
    const t = Date.now();
    if (intent.type === "STRIKE") {
      if (t - lastStrike.current < STRIKE_COOLDOWN_MS) return;
      lastStrike.current = t;
    }
    setUndone(intent.type === "UNDO"); // the projector stays quiet for a step back
    commit(reduce(sessionRef.current, { id: newId(), ...intent } as HostAction));
  }, [commit]);

  // Phone presses arrive here. The first valid one becomes the same BUZZ a tap would make: one authority, one rule set.
  useEffect(() => {
    if (!phoneMode) return;
    buzzerHandlers.pair = (actorId, payload) => {
      const r = pair(buzzersRef.current, actorId, payload, newToken);
      commitBuzzers(r.buzzers);
      return r.result;
    };
    buzzerHandlers.press = (actorId, payload) => {
      const r = press(buzzersRef.current, actorId, payload, Date.now());
      commitBuzzers(r.buzzers);
      if (r.result.ok && r.result.status === "first") act({ type: "BUZZ", team: r.result.team });
      return r.result;
    };
    return () => {
      buzzerHandlers.pair = null;
      buzzerHandlers.press = null;
    };
  }, [phoneMode, commitBuzzers, act]);
  const online = useCallback((actorId: string) => host.players.some((p) => p.id === actorId), [host.players]);
  const publicPhones = useMemo(() => (phoneMode ? publicBuzzers(buzzers, online) : null), [phoneMode, buzzers, online]);

  const startRound = (q: Question, team: TeamId) => {
    setPreviewId(null);
    act({ type: "START_ROUND", team, question: { id: q.id, category: q.category, prompt: q.prompt, demo: pack.purpose === "demo", answers: q.answers } });
  };

  const restoreSession = (s: Session, p: Pack) => {
    updatePack(p);
    holdSave.current = false;
    commit(s);
  };

  // -- public snapshot -------------------------------------------------------
  const rev = useRef(Date.now()); // monotonic across reloads, so a reloaded host is never "older"
  const latest = useRef<PublicSnapshot | null>(null);
  const chan = useRef<ReturnType<typeof openChannel> | null>(null);
  const preview = previewId ? PENDING_PACK.questions.find((q) => q.id === previewId) : null;
  const demo = pack.purpose === "demo" || session.state.round?.demo === true;

  useEffect(() => {
    const snap = projectPublic({
      rev: ++rev.current,
      game: session.state,
      demo,
      room,
      timer,
      undone,
      buzzers: publicPhones,
      preview: preview && session.state.phase === "lobby" ? { category: preview.category, prompt: preview.prompt } : null,
    });
    latest.current = snap;
    chan.current?.post({ kind: "snapshot", snapshot: snap });
    publishSnapshot(snap);
    setSnapshot(snap);
  }, [session.state, demo, room, timer, undone, publicPhones, preview]);

  useEffect(() => {
    const c = openChannel((m) => {
      if (m.kind === "request" && latest.current) c.post({ kind: "snapshot", snapshot: latest.current });
      // Another moderator window in this browser is publishing too: two consoles would fight over one save.
      if (m.kind === "snapshot") setDuplicate(true);
      if (m.kind === "screen") setScreen({ sound: m.sound, at: Date.now() });
    });
    chan.current = c;
    if (latest.current) c.post({ kind: "snapshot", snapshot: latest.current });
    const beat = setInterval(() => {
      c.post({ kind: "heartbeat", rev: rev.current });
      setClock(Date.now());
    }, HEARTBEAT_MS);
    return () => {
      clearInterval(beat);
      c.close();
      chan.current = null;
    };
  }, []);

  // The projector reports in with every heartbeat; silence means its window is closed or asleep.
  const projector: "closed" | ScreenSound = screen && clock - screen.at < STALE_AFTER_MS ? screen.sound : "closed";
  const testSound = () => chan.current?.post({ kind: "test-sound" });

  const backupPack = useMemo(() => loadBackupPack(), [pack]); // eslint-disable-line react-hooks/exhaustive-deps

  const replacePack = (raw: unknown): { ok: true; warnings: string[] } | { ok: false; errors: string[] } => {
    const r = validatePack(raw);
    if (!r.ok) return r; // a rejected import leaves the current pack and game alone
    updatePack(r.pack);
    return { ok: true, warnings: r.warnings };
  };

  return {
    arcade,
    host,
    pack,
    replacePack,
    resetPack: () => updatePack(structuredClone(PENDING_PACK)),
    backupPack,
    session,
    state: session.state,
    canUndo: session.history.length > 0,
    act,
    startRound,
    // The next pair of teams never inherits the last pair's buzzer phones: new codes, old tokens dead.
    nextTeams: () => {
      act({ type: "NEW_MATCH", nextTeams: true });
      commitBuzzers(resetPairing(buzzersRef.current, rand));
    },
    buzzers,
    phones: publicPhones,
    openBuzzers: () => commitBuzzers(openBuzzers(buzzersRef.current, newId(), Date.now())),
    closeBuzzers: () => commitBuzzers(closeBuzzers(buzzersRef.current)),
    newCodes: (team?: TeamId) => commitBuzzers(resetPairing(buzzersRef.current, rand, team ? [team] : undefined)),
    resumeOffer,
    resume,
    startFresh,
    restoreSession,
    saveStatus,
    notice,
    setNotice,
    room,
    relay,
    buzzerMode,
    setBuzzerMode,
    projector,
    testSound,
    timer,
    startTimer: (seconds: number) => setTimer({ endsAt: Date.now() + seconds * 1000, durationMs: seconds * 1000 }),
    stopTimer: () => setTimer(null),
    previewId,
    setPreviewId,
    snapshot,
    duplicate,
    demo,
  };
}

export type HostGame = ReturnType<typeof useHostGame>;
