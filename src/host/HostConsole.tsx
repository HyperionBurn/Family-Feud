import { useEffect, useState } from "react";
import { isLocalOnly } from "../public/url";
import { ArcadeBar } from "../arcade/ArcadeBar";
import { Guide } from "./Guide";
import { LiveTab } from "./PlayTab";
import { SetupTab } from "./SetupTab";
import { guideSeen, hasProgress, markGuideSeen } from "./persist";
import { useHostGame, type HostGame } from "./useHostGame";

type Tab = "live" | "setup";

/** Optional shortcuts: 1-9 and 0 reveal answers 1-10, X wrong answer, U undo. Held keys and text fields are ignored. */
function useShortcuts(g: HostGame, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const { phase, round } = g.state;
      const k = e.key.toLowerCase();
      if (k === "u") return void (g.canUndo && g.act({ type: "UNDO" }));
      if (!round) return;
      if (k === "x" && phase === "face_off") return void g.act({ type: "FACEOFF_MISS" });
      if (k === "x" && (phase === "team_turn" || phase === "steal")) return void g.act({ type: "STRIKE" });
      if (/^[0-9]$/.test(k) && (phase === "face_off" || phase === "team_turn" || phase === "steal" || phase === "round_over")) {
        const slot = k === "0" ? 10 : Number(k);
        const a = round.answers[slot - 1];
        if (a) g.act({ type: "REVEAL", answerId: a.id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [g, enabled]);
}

const PROJECTOR_TEXT = { closed: "Projector not open", off: "Projector sound off", muted: "Projector muted", on: "Projector ready" } as const;

export function HostConsole() {
  const g = useHostGame();
  const [tab, setTab] = useState<Tab>("live");
  const [guide, setGuide] = useState(false);
  const [offer, setOffer] = useState(() => !guideSeen());
  useShortcuts(g, tab === "live" && !g.resumeOffer && !guide);
  const { room } = g;
  const phoneMode = g.buzzerMode === "phone";
  const screenHref = `/screen/${room.code ?? "local"}`;
  const noResults = g.pack.purpose !== "demo" && !g.pack.questions.some((q) => q.status === "ready");
  // Offered once, to a console with nothing under way: an empty autosave is not a match.
  const showOffer = offer && !guide && !g.resumeOffer && !hasProgress(g.session);

  const startGuide = () => {
    setTab("live");
    setOffer(false);
    setGuide(true);
  };
  const endGuide = (how: "done" | "skipped") => {
    markGuideSeen(how);
    setOffer(false);
    setGuide(false);
  };

  return (
    <div className="host" data-theme="frost">
      <header className="host__head">
        <p className="host__title">Family Feud <span>Moderator</span></p>
        <nav className="switch" role="tablist" aria-label="Console">
          <button type="button" role="tab" aria-selected={tab === "live"} className="switch__opt" onClick={() => setTab("live")}>Live</button>
          <button type="button" role="tab" aria-selected={tab === "setup"} className="switch__opt" data-tour="setup-tab" onClick={() => setTab("setup")}>Setup</button>
        </nav>
        <div className="host__status">
          <span className={`dot-status ${g.saveStatus && !g.saveStatus.ok ? "is-bad" : ""}`} title={g.saveStatus?.ok ? `Saved in this browser at ${new Date(g.saveStatus.at).toLocaleTimeString()}` : undefined}>
            {g.saveStatus?.ok ? "Saved" : g.saveStatus ? "Not saved" : "Saving"}
          </span>
          <span className={`dot-status ${g.projector === "on" ? "" : g.projector === "off" ? "is-bad" : "is-idle"}`}>{PROJECTOR_TEXT[g.projector]}</span>
          {phoneMode && <span className={`dot-status ${room.status === "ready" ? "" : "is-bad"}`}>Phones {room.status === "ready" ? "online" : room.status === "connecting" ? "connecting" : "offline"}</span>}
          <button type="button" className="link-btn" data-tour="guide" onClick={startGuide}>Quick guide</button>
          {g.arcade ? (
            <span className="dot-status is-idle" data-tour="projector">Projector: the arcade screen</span>
          ) : (
            <a className="bi-button bi-button--outline host__btn" data-tour="projector" href={screenHref} target="gdg-ff-screen" rel="noopener">Open projector</a>
          )}
        </div>
      </header>

      <div className="alerts">
        {g.arcade && <ArcadeBar g={g} launch={g.arcade} />}
        {g.demo && <div className="alert alert--demo" role="status"><b>DEMO: INVENTED RESULTS.</b> Practice answers, not the survey.</div>}
        {g.saveStatus && !g.saveStatus.ok && (
          <div className="alert alert--bad" role="alert"><b>Not saved.</b> Browser storage failed ({g.saveStatus.error}). The game carries on in memory. Export a backup in Setup now.</div>
        )}
        {g.duplicate && (
          <div className="alert alert--bad" role="alert"><b>Another moderator window is open.</b> Two consoles in one browser overwrite each other&apos;s saved game. Close one of them.</div>
        )}
        {noResults && g.state.phase === "lobby" && (
          <div className="alert" role="status"><b>No survey results loaded yet.</b> Paste them in Setup, under Survey results. For a rehearsal, load the demo pack there.</div>
        )}
        {g.projector === "off" && (
          <div className="alert" role="status"><b>Projector sound is off.</b> Click Enable sound in the projector window.</div>
        )}
        {phoneMode && room.status === "offline" && (
          <div className="alert" role="status"><b>Phone buzzers are offline.</b> Tap the team the hosts name instead. The board and scores keep working.</div>
        )}
        {phoneMode && room.status === "ready" && isLocalOnly(room.joinUrl) && (
          <div className="alert" role="alert"><b>Phones cannot join this address.</b> The join link points at localhost. Use the deployed site, or set VITE_AIR_JAM_PUBLIC_HOST to this laptop&apos;s network address.</div>
        )}
        {g.notice && (
          <div className="alert alert--notice" role="status">{g.notice} <button type="button" className="link-btn" onClick={() => g.setNotice(null)}>Dismiss</button></div>
        )}
      </div>

      {g.resumeOffer && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="resume-h">
          <div className="modal__card">
            <h2 id="resume-h">Carry on with the saved game?</h2>
            <p>
              Saved {new Date(g.resumeOffer.savedAt).toLocaleString()}: {g.resumeOffer.session.state.teams.A.name} {g.resumeOffer.session.state.teams.A.score},{" "}
              {g.resumeOffer.session.state.teams.B.name} {g.resumeOffer.session.state.teams.B.score}, {g.resumeOffer.session.state.roundsPlayed} round(s) played.
            </p>
            <p className="muted">Resuming restores the question, revealed answers, scores, strikes and any points already given.</p>
            <div className="row">
              <button type="button" className="bi-button host__btn host__btn--lg" onClick={g.resume}>Resume the game</button>
              <button type="button" className="bi-button bi-button--outline host__btn host__btn--lg" onClick={g.startFresh}>Start a new game</button>
            </div>
          </div>
        </div>
      )}

      {showOffer && (
        <div className="offer" role="dialog" aria-labelledby="offer-h">
          <p id="offer-h" className="offer__h">New here? Learn the controls in about a minute.</p>
          <div className="row">
            <button type="button" className="bi-button host__btn" onClick={startGuide}>Start guide</button>
            <button type="button" className="bi-button bi-button--outline host__btn" onClick={() => endGuide("skipped")}>Skip</button>
          </div>
        </div>
      )}

      <main className="host__body">
        {tab === "live" ? <LiveTab g={g} /> : <SetupTab g={g} />}
      </main>

      {guide && <Guide phoneMode={phoneMode} onClose={endGuide} />}
    </div>
  );
}
