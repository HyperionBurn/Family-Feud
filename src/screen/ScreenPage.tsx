import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { announceReady, currentLaunch } from "../arcade/launch";
import { HEARTBEAT_MS, STALE_AFTER_MS, openChannel, type ChannelMessage, type ScreenSound } from "../public/channel";
import type { TeamId } from "../engine/types";
import type { PublicSnapshot } from "../public/types";
import { ScreenView, type Flash, type FlashSpec } from "../ui/ScreenView";
import { Sfx, cueFor, musicWanted, type Cue } from "../ui/sound";

const X_MS = 1100;
const BANNER_MS = 1800;

/** The banner or red X a cue shows on the projector, if any. */
function flashFor(cue: Cue, s: PublicSnapshot): FlashSpec | null {
  const team = (id: TeamId | null | undefined) => s.teams.find((t) => t.id === id)?.name.toUpperCase() ?? "";
  switch (cue) {
    case "strike":
      return { kind: "x", count: Math.max(1, s.strikes) };
    case "faceoffMiss":
    case "stealMiss":
      return { kind: "x", count: 1 };
    case "steal":
      return { kind: "banner", text: "STEAL!", sub: `${team(s.control === "A" ? "B" : "A")}: ONE GUESS` };
    case "play":
    case "pass":
      return s.faceOff?.winner ? { kind: "banner", text: `${team(s.faceOff.winner)} ${cue === "play" ? "PLAYS" : "PASSES"}` } : null;
    case "award":
      return s.settlement ? { kind: "banner", text: `${team(s.settlement.winner)} +${s.settlement.amount}` } : null;
    default:
      return null;
  }
}

export function ScreenPage() {
  const { roomCode = "" } = useParams();
  const [snap, setSnap] = useState<PublicSnapshot | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const [now, setNow] = useState(Date.now());
  const sfx = useRef(new Sfx()).current;
  const [audio, setAudio] = useState({ unlocked: false, muted: false, music: true, volume: 0.7 });
  const [gateClosed, setGateClosed] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [fs, setFs] = useState(false);
  const [awake, setAwake] = useState(true);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [played, setPlayed] = useState<{ n: number; last: Cue | null }>({ n: 0, last: null });
  const prev = useRef<PublicSnapshot | null>(null);
  const timers = useRef<number[]>([]);
  const chan = useRef<ReturnType<typeof openChannel> | null>(null);

  const sound: ScreenSound = !audio.unlocked ? "off" : audio.muted || quiet ? "muted" : "on";
  const soundRef = useRef(sound);

  // When the arcade hub launched this screen, tell it the board is up so it can drop its loading splash.
  useEffect(() => {
    const launch = currentLaunch();
    return launch ? announceReady(launch) : undefined;
  }, []);

  useEffect(() => {
    const ch = openChannel((m: ChannelMessage) => {
      if (m.kind === "snapshot") {
        // Only accept newer revisions so a late message cannot roll the board back.
        setSnap((cur) => (cur && m.snapshot.rev < cur.rev ? cur : m.snapshot));
        setLastSeen(Date.now());
      } else if (m.kind === "heartbeat") setLastSeen(Date.now());
      else if (m.kind === "test-sound") sfx.play("test");
    });
    chan.current = ch;
    ch.post({ kind: "request" }); // ask for the current snapshot on load
    const beat = setInterval(() => {
      ch.post({ kind: "request" });
      ch.post({ kind: "screen", sound: soundRef.current }); // tell the console this window is open, and its sound
    }, HEARTBEAT_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const pending = timers.current;
    return () => {
      ch.close();
      chan.current = null;
      clearInterval(beat);
      clearInterval(tick);
      pending.forEach((t) => window.clearTimeout(t));
    };
  }, [sfx]);

  useEffect(() => {
    soundRef.current = sound;
    chan.current?.post({ kind: "screen", sound });
  }, [sound]);

  const show = useCallback((f: FlashSpec, ms: number) => {
    const id = Date.now();
    setFlash({ ...f, id });
    timers.current.push(window.setTimeout(() => setFlash((cur) => (cur?.id === id ? null : cur)), ms));
  }, []);

  // One accepted action, one cue: a sound and, for the big moments, a red X or a banner. Scores never wait on these.
  useEffect(() => {
    if (!snap) return;
    const cue = cueFor(prev.current, snap);
    prev.current = snap;
    if (!cue) return;
    sfx.play(cue);
    setPlayed((p) => ({ n: p.n + 1, last: cue }));
    const f = flashFor(cue, snap);
    if (f) show(f, f.kind === "x" ? X_MS : BANNER_MS);
    if (cue === "strike" && snap.phase === "steal") {
      // The third X, then the steal.
      timers.current.push(window.setTimeout(() => {
        sfx.play("steal");
        setPlayed((p) => ({ n: p.n + 1, last: "steal" }));
        const steal = flashFor("steal", snap);
        if (steal) show(steal, BANNER_MS);
      }, X_MS));
    }
  }, [snap, sfx, show]);

  // Settings reach the audio engine from here. Quiet mode silences everything and stops animation.
  useEffect(() => {
    sfx.muted = quiet || audio.muted;
    sfx.musicOn = audio.music;
    sfx.volume = audio.volume;
    sfx.apply();
  }, [sfx, quiet, audio.muted, audio.music, audio.volume]);

  // The theme plays between rounds, on the question intro and at the end; live play is silent so the hosts can talk.
  const wantMusic = !!snap && musicWanted(snap);
  useEffect(() => {
    sfx.setMusic(wantMusic);
  }, [sfx, wantMusic, audio.unlocked]);

  // The host's countdown: a tick for each of the last three seconds, a buzzer at zero. A cancelled timer makes no sound.
  const timerEnd = snap?.timer?.endsAt ?? null;
  useEffect(() => {
    if (timerEnd === null || timerEnd <= Date.now()) return;
    const tick = setInterval(() => {
      const left = timerEnd - Date.now();
      if (left > 0 && left <= 3000) sfx.play("tick");
    }, 1000);
    const done = setTimeout(() => sfx.play("timeUp"), timerEnd - Date.now());
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [timerEnd, sfx]);

  // The control bar steps aside once sound is on or the screen is fullscreen; any pointer or key brings it back.
  useEffect(() => {
    let t = 0;
    const wake = () => {
      setAwake(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setAwake(false), 4000);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Browsers only allow sound after a click on this window; the state shown is the browser's real answer.
  const unlock = useCallback(async () => {
    const ok = await sfx.unlock();
    setAudio((a) => ({ ...a, unlocked: ok }));
    if (ok) setGateClosed(true);
  }, [sfx]);
  const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  const setMuted = (muted: boolean) => setAudio((a) => ({ ...a, muted }));
  const setVolume = (volume: number) => setAudio((a) => ({ ...a, volume }));

  const stale = snap !== null && now - lastSeen > STALE_AFTER_MS;
  const mismatch = snap?.room.code && roomCode !== "local" && roomCode.toUpperCase() !== snap.room.code;

  return (
    <div className="screen-page" data-quiet={quiet || undefined} data-cues={played.n} data-last-cue={played.last ?? undefined} data-sound={sound}>
      {snap ? (
        <ScreenView snapshot={snap} flash={flash} />
      ) : (
        <div className="screen-wait" data-theme="ice">
          <p className="bi-label">GDG ON CAMPUS · UOBD</p>
          <h1>Waiting for the moderator</h1>
          <p>Open <Link to="/host">/host</Link> in another window on this laptop. This screen fills in by itself.</p>
        </div>
      )}
      {stale && (
        <div className="screen-stale" role="status" data-theme="ice">
          <p className="bi-label">RECONNECTING</p>
          <p>Lost contact with the moderator window. The board returns when it does.</p>
        </div>
      )}
      {mismatch && <div className="screen-mismatch" role="status">URL says room {roomCode.toUpperCase()}, host is on {snap!.room.code}</div>}
      {!audio.unlocked && !gateClosed && (
        <div className="sound-gate" data-theme="ice">
          <div className="sound-gate__card">
            <p className="bi-label">BEFORE THE SHOW</p>
            <p className="sound-gate__h">Sound is off until you click here</p>
            <p>Browsers only play sound after a click on this window.</p>
            <div className="sound-gate__row">
              <button type="button" className="bi-button" onClick={unlock}>Enable sound</button>
              <button type="button" className="bi-button bi-button--outline" onClick={() => setGateClosed(true)}>Continue without sound</button>
            </div>
          </div>
        </div>
      )}
      <div className={`screen-bar ${!awake && (fs || audio.unlocked) ? "screen-bar--idle" : ""}`} data-theme="ice">
        <button type="button" className="bar-btn" onClick={audio.unlocked ? () => sfx.play("test") : unlock} aria-pressed={audio.unlocked}>{audio.unlocked ? "TEST SOUND" : "ENABLE SOUND"}</button>
        <button type="button" className="bar-btn" onClick={() => setMuted(!audio.muted)} aria-pressed={audio.muted}>{audio.muted ? "UNMUTE" : "MUTE"}</button>
        <label className="bar-vol">VOL
          <input type="range" min={0} max={1} step={0.05} value={audio.volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
        </label>
        <button type="button" className="bar-btn" onClick={() => setAudio((a) => ({ ...a, music: !a.music }))} aria-pressed={!audio.music}>{audio.music ? "MUSIC ON" : "MUSIC OFF"}</button>
        <button type="button" className="bar-btn" onClick={() => setQuiet(!quiet)} aria-pressed={quiet}>QUIET {quiet ? "ON" : "OFF"}</button>
        <button type="button" className="bar-btn" onClick={toggleFs}>{fs ? "EXIT FULLSCREEN" : "FULLSCREEN"}</button>
      </div>
    </div>
  );
}
