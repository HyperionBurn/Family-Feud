// Console strip shown only when the arcade hub launched this game: who is on which team, and the one button that
// sends the final scores to the hub. The hosts decide when the game is over, so nothing is sent automatically.
import { useEffect, useMemo, useRef, useState } from "react";
import type { HostGame } from "../host/useHostGame";
import { hubClient, placementsFor, progressFor, splitTeams, type ArcadeLaunch } from "./launch";

const SENT_KEY = "ff.arcade.sent.v1";
const wasSent = (round: string): boolean => {
  try {
    return localStorage.getItem(SENT_KEY) === round;
  } catch {
    return false;
  }
};

export function ArcadeBar({ g, launch }: { g: HostGame; launch: ArcadeLaunch }) {
  const hub = useMemo(() => hubClient(launch), [launch]);
  const teams = useMemo(() => splitTeams(launch.players, launch.round), [launch]);
  const [sent, setSent] = useState(() => wasSent(launch.round));
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { teams: names } = g.state;
  const scores = { A: names.A.score, B: names.B.score };

  // Live scores for the hub's HUD, only when they change.
  const last = useRef("");
  useEffect(() => {
    const key = `${scores.A}-${scores.B}`;
    if (sent || key === last.current) return;
    last.current = key;
    void hub.progress(progressFor(teams, scores));
  }, [hub, teams, scores.A, scores.B, sent]); // eslint-disable-line react-hooks/exhaustive-deps

  const over = g.state.phase === "match_over";
  const level = scores.A === scores.B;

  const send = async (): Promise<void> => {
    setBusy(true);
    setFailed(false);
    const ok = await hub.result(placementsFor(teams, scores, { A: names.A.name, B: names.B.name }));
    setBusy(false);
    if (!ok) return setFailed(true);
    setSent(true);
    try {
      localStorage.setItem(SENT_KEY, launch.round);
    } catch {
      /* the hub has the result either way */
    }
  };

  return (
    <div className="alert alert--notice" role="status" data-arcade="bar">
      <b>ARCADE NIGHT.</b> Results go to the leaderboard.{" "}
      {(["A", "B"] as const).map((id) => (
        <span key={id} style={{ marginRight: 16 }}>
          <b>{names[id].name}:</b> {teams[id].map((p) => p.name).join(", ") || "no players"}
        </span>
      ))}
      {sent ? (
        <b data-arcade="sent"> Result sent. The arcade is showing the standings.</b>
      ) : over ? (
        <span>
          {" "}
          <b>{level ? "Level. Play a tie-break first, or send it as a draw." : "Game over."}</b>{" "}
          <button type="button" className="bi-button host__btn" disabled={busy} onClick={() => void send()} data-arcade="send">
            {busy ? "Sending…" : "Send the result to the arcade"}
          </button>
          {failed && <b role="alert"> Could not reach the arcade. Try again; the host can also enter the result there.</b>}
        </span>
      ) : null}
    </div>
  );
}
