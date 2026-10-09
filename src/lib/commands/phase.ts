import { invoke } from "@tauri-apps/api/core";
import type { Phase, PhaseCheckIn } from "../types";

export function listPhases(includeInactive: boolean): Promise<Phase[]> {
  return invoke("list_phases", { includeInactive });
}

export function latestPhaseCheckIn(
  includeIdle = true,
): Promise<PhaseCheckIn | null> {
  return invoke("latest_phase_check_in", { includeIdle });
}

export function listPhaseCheckIns(
  from: number,
  to: number,
): Promise<PhaseCheckIn[]> {
  return invoke("list_phase_check_ins", { from, to });
}
