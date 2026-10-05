// Arcade hub adapter, the pure half. Inert unless the hub opened this page.
//
// When the arcade hub launches Family Feud it adds ?arcade=<hub origin>&session&round&token&players=<base64url JSON>
// to the projector and console URLs. The hub owns the players and the leaderboard; the hosts still run the game
// verbally, so the adapter does exactly three things: split the hub's players into the two teams, tell the hub the
// board is up, and send the final scores back as a finishing order. Contract: apps/arcade-hub/README.md.
import type { TeamId } from "../engine/types";

export interface ArcadePlayer {
  id: string;
  name: string;
}

export interface ArcadeLaunch {
  origin: string;
  session: string;
  round: string;
  token: string;
  players: ArcadePlayer[];
}

export interface HubPlacement {
  playerId: string;
  rank: number | null;
  score?: number;
  stats?: Record<string, number>;
  group?: string;
}

const fromBase64Url = (value: string): string => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
};

export function decodePlayers(value: string | null): ArcadePlayer[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(value));
    if (!Array.isArray(parsed)) return [];
    const out: ArcadePlayer[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const { id, name } = entry as Record<string, unknown>;
      if (typeof id !== "string" || !id) continue;
      out.push({ id, name: typeof name === "string" && name.trim() ? name.trim() : "Player" });
    }
    return out;
  } catch {
    return [];
  }
}

/** The launch the hub handed this page, or null when the game was opened on its own. */
export function readArcadeLaunch(search: string): ArcadeLaunch | null {
  const q = new URLSearchParams(search);
  const origin = q.get("arcade");
  const session = q.get("session");
  const round = q.get("round");
  const token = q.get("token");
  if (!origin || !session || !round || !token) return null;
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { origin: origin.replace(/\/+$/, ""), session, round, token, players: decodePlayers(q.get("players")) };
}

/** Same launch on every load of this page, wherever it is called from. */
export const currentLaunch = (): ArcadeLaunch | null => (typeof window === "undefined" ? null : readArcadeLaunch(window.location.search));

// -- teams ------------------------------------------------------------------------------------------------

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * Two teams from the hub's players. Deterministic in the round id, so reloading the console never reshuffles who
 * is on which side, and sizes differ by at most one. Team A gets the extra player when the count is odd.
 */
export function splitTeams(players: readonly ArcadePlayer[], seed: string): Record<TeamId, ArcadePlayer[]> {
  const ranked = [...players].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`) || a.id.localeCompare(b.id));
  const half = Math.ceil(ranked.length / 2);
  return { A: ranked.slice(0, half), B: ranked.slice(half) };
}

/** A short team name the engine keeps whole (it truncates at 24): one player's name, a pair, or the captain's team. */
export function teamName(members: readonly ArcadePlayer[], fallback: string): string {
  const names = members.map((m) => m.name);
  if (names.length === 0) return fallback;
  if (names.length === 1) return names[0]!.slice(0, 24);
  const pair = names.length === 2 ? `${names[0]} & ${names[1]}` : "";
  if (pair && pair.length <= 24) return pair;
  const captain = `Team ${names[0]}`;
  return captain.length <= 24 ? captain : `${names[0]!.slice(0, 19)} +${names.length - 1}`;
}

// -- result -----------------------------------------------------------------------------------------------

/** Higher score first; a level game shares first place. Everyone on a team shares its place. */
export function placementsFor(
  teams: Record<TeamId, readonly ArcadePlayer[]>,
  scores: Record<TeamId, number>,
  names: Record<TeamId, string> = { A: "Team A", B: "Team B" },
): HubPlacement[] {
  const winner: TeamId | null = scores.A === scores.B ? null : scores.A > scores.B ? "A" : "B";
  return (["A", "B"] as const).flatMap((id) =>
    teams[id].map((player) => ({
      playerId: player.id,
      rank: winner === null || winner === id ? 1 : 2,
      score: scores[id],
      stats: { points: scores[id], against: scores[id === "A" ? "B" : "A"] },
      group: names[id],
    })),
  );
}

/** Live score for the hub's HUD: each player shows their team's points. */
export function progressFor(teams: Record<TeamId, readonly ArcadePlayer[]>, scores: Record<TeamId, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ["A", "B"] as const) for (const player of teams[id]) out[player.id] = scores[id];
  return out;
}

// -- hub client -------------------------------------------------------------------------------------------

async function post(launch: ArcadeLaunch, path: "ready" | "progress" | "result", body: unknown): Promise<boolean> {
  try {
    const response = await fetch(`${launch.origin}/api/rounds/${launch.round}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${launch.token}` },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const hubClient = (launch: ArcadeLaunch) => ({
  ready: () => post(launch, "ready", { controllerUrl: null }),
  progress: (scores: Record<string, number>) => post(launch, "progress", { scores }),
  result: (placements: HubPlacement[]) => post(launch, "result", { placements }),
});

/** The projector announces itself once it is up; retried because the hub may still be finishing the page load. */
export function announceReady(launch: ArcadeLaunch, tries = 8): () => void {
  let live = true;
  let timer = 0;
  const attempt = async (left: number): Promise<void> => {
    const ok = await hubClient(launch).ready();
    if (!ok && live && left > 1) timer = window.setTimeout(() => void attempt(left - 1), 1500);
  };
  void attempt(tries);
  return () => {
    live = false;
    window.clearTimeout(timer);
  };
}
