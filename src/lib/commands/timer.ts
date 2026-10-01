import { invoke } from "@tauri-apps/api/core";
import type { TimerState } from "../types";

export function getTimerState(): Promise<TimerState> {
  return invoke("get_timer_state");
}

export function startTimer(minutes: number): Promise<TimerState> {
  return invoke("start_timer", { minutes });
}
