import { invoke } from "@tauri-apps/api/core";
import type { Phase, PhaseCheckIn } from "../types";

export function listPhases(includeInactive: boolean): Promise<Phase[]> {
  return invoke("list_phases", { includeInactive });
}

export function setPhaseIcon(id: number, icon: string): Promise<Phase> {
  return invoke("set_phase_icon", { id, icon });
}

export function setPhaseColor(id: number, color: string | null): Promise<Phase> {
  return invoke("set_phase_color", { id, color });
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
