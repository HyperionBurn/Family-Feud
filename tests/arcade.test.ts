import { describe, expect, it } from "vitest";
import { decodePlayers, placementsFor, progressFor, readArcadeLaunch, splitTeams, teamName, type ArcadePlayer } from "../src/arcade/launch";
import { arcadeSession } from "../src/arcade/session";
import { apply, initialSession } from "../src/engine/reducer";

const enc = (v: unknown) => Buffer.from(JSON.stringify(v), "utf8").toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const P = (id: string, name = id): ArcadePlayer => ({ id, name });

describe("arcade launch", () => {
  it("reads the hub's parameters and rejects everything else", () => {
    const players = enc([{ id: "a1", name: "Ana", color: "#fff" }, { id: "b2", name: "Zoë" }]);
    const l = readArcadeLaunch(`?arcade=https%3A%2F%2Fhub.test%2F&session=ABCD&round=r1&token=t&players=${players}`)!;
    expect(l.origin).toBe("https://hub.test");
    expect(l.players.map((p) => p.name)).toEqual(["Ana", "Zoë"]);
    expect(readArcadeLaunch("")).toBeNull();
    expect(readArcadeLaunch("?arcade=javascript%3A1&session=a&round=r&token=t")).toBeNull();
    expect(decodePlayers("%%%")).toEqual([]);
  });
});

describe("teams", () => {
  const six = ["a1", "b2", "c3", "d4", "e5", "f6"].map((id) => P(id));

  it("splits everyone exactly once, evenly, and the same way every time", () => {
    const t = splitTeams(six, "round-1");
    expect(t.A.length).toBe(3);
    expect(t.B.length).toBe(3);
    expect([...t.A, ...t.B].map((p) => p.id).sort()).toEqual(six.map((p) => p.id));
    expect(splitTeams([...six].reverse(), "round-1")).toEqual(t);
    expect(splitTeams(six, "round-2")).not.toEqual(t);
  });

  it("gives the extra player to team A and handles two players", () => {
    expect(splitTeams(six.slice(0, 5), "x").A.length).toBe(3);
    const two = splitTeams(six.slice(0, 2), "x");
    expect([two.A.length, two.B.length]).toEqual([1, 1]);
  });

  it("names teams within the engine's 24 characters", () => {
    expect(teamName([], "Team A")).toBe("Team A");
    expect(teamName([P("a", "Ana")], "x")).toBe("Ana");
    expect(teamName([P("a", "Ana"), P("b", "Bo")], "x")).toBe("Ana & Bo");
    expect(teamName([P("a", "Ana"), P("b", "Bo"), P("c", "Cy")], "x")).toBe("Team Ana");
    expect(teamName([P("a", "A very long player name indeed"), P("b", "Bo")], "x").length).toBeLessThanOrEqual(24);
  });
});

describe("result", () => {
  const teams = { A: [P("a1"), P("a2")], B: [P("b1")] };

  it("winning team shares first, the other second", () => {
    const r = placementsFor(teams, { A: 120, B: 80 });
    expect(r.map((p) => [p.playerId, p.rank])).toEqual([["a1", 1], ["a2", 1], ["b1", 2]]);
    expect(r[2]!.score).toBe(80);
    expect(placementsFor(teams, { A: 120, B: 80 }, { A: "Ana & Bo", B: "Cy" }).map((p) => p.group)).toEqual(["Ana & Bo", "Ana & Bo", "Cy"]);
    expect(placementsFor(teams, { A: 10, B: 40 }).map((p) => p.rank)).toEqual([2, 2, 1]);
  });

  it("a level game is a shared first place", () => {
    expect(placementsFor(teams, { A: 50, B: 50 }).map((p) => p.rank)).toEqual([1, 1, 1]);
  });

  it("progress gives each player their team's score", () => {
    expect(progressFor(teams, { A: 7, B: 9 })).toEqual({ a1: 7, a2: 7, b1: 9 });
  });
});

describe("the console's starting game", () => {
  const launch = { origin: "https://hub.test", session: "ABCD", round: "r1", token: "t", players: [P("a1", "Ana"), P("b2", "Bo")] };

  it("names the teams from the hub's players", () => {
    const s = arcadeSession(launch, null);
    expect(s.state.phase).toBe("lobby");
    expect([s.state.teams.A.name, s.state.teams.B.name].sort()).toEqual(["Ana", "Bo"]);
  });

  it("keeps questions an earlier round already used marked, with fresh scores", () => {
    let earlier = initialSession();
    earlier = { ...earlier, state: { ...earlier.state, playedQuestionIds: ["q1", "q2"], teams: { A: { name: "x", score: 90 }, B: { name: "y", score: 10 } }, roundsPlayed: 3, phase: "match_over" } };
    const s = arcadeSession({ ...launch, round: "r2" }, earlier);
    expect(s.state.usedEarlier).toEqual(["q1", "q2"]);
    expect(s.state.teams.A.score).toBe(0);
    expect(s.state.roundsPlayed).toBe(0);
    expect(apply(s, { id: "z", type: "ADJUST_SCORE", team: "A", delta: 5 }).state.teams.A.score).toBe(5);
  });
});
