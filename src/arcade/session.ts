// The console's starting point when the arcade hub launched it: a fresh game between the hub's two teams.
import { apply, initialSession } from "../engine/reducer";
import type { Session } from "../engine/types";
import { newId } from "../util/id";
import { splitTeams, teamName, type ArcadeLaunch } from "./launch";

/**
 * A new game for this hub round. If the console already holds an earlier game (a previous round of the same night),
 * its played questions stay marked "used", so the next pair of teams gets fresh questions. Team names come from the
 * hub's players; the moderator can still rename them.
 */
export function arcadeSession(launch: ArcadeLaunch, earlier: Session | null): Session {
  const base = earlier ? apply(earlier, { id: newId(), type: "NEW_MATCH", nextTeams: true }) : initialSession();
  const teams = splitTeams(launch.players, launch.round);
  return apply(base, {
    id: newId(),
    type: "SET_TEAM_NAMES",
    names: { A: teamName(teams.A, "Team A"), B: teamName(teams.B, "Team B") },
  });
}
