import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  AssistantConversation,
  AssistantMessage,
  AssistantModel,
  AssistantPrompt,
  AssistantStreamEvent,
  AssistantTurn,
  BrainDump,
  Metric,
  MetricCheckIn,
  MetricCheckInWithRatings,
  MetricRatingInput,
  Phase,
  PhaseCheckIn,
  Pulse,
  RatingValue,
  Task,
  TaskDependency,
  TaskStatusEvent,
  TaskWorkStretch,
  TaskStatus,
  Tag,
  Reminder,
  TimerState,
} from "./types";

/** Greetings-board line length at the 600px dashboard minimum. */
export const MAX_REMINDER_CHARS = 27;
export const MAX_ASSISTANT_TITLE_CHARS = 80;
export const MAX_ASSISTANT_PROMPT_CHARS = 12_000;
export const MAX_ASSISTANT_MESSAGE_CHARS = 24_000;

export function assistantApiKeyConfigured(): Promise<boolean> {
  return invoke("assistant_api_key_configured");
}

export function setAssistantApiKey(apiKey: string): Promise<void> {
  return invoke("set_assistant_api_key", { apiKey });
}

export function deleteAssistantApiKey(): Promise<void> {
  return invoke("delete_assistant_api_key");
}

export function listAssistantPrompts(): Promise<AssistantPrompt[]> {
  return invoke("list_assistant_prompts");
}

export function createAssistantPrompt(
  title: string,
  instructions: string,
): Promise<AssistantPrompt> {
  return invoke("create_assistant_prompt", { title, instructions });
}

export function updateAssistantPrompt(
  id: number,
  title: string,
  instructions: string,
): Promise<AssistantPrompt> {
  return invoke("update_assistant_prompt", { id, title, instructions });
}

export function deleteAssistantPrompt(id: number): Promise<void> {
  return invoke("delete_assistant_prompt", { id });
}

export function listAssistantConversations(): Promise<AssistantConversation[]> {
  return invoke("list_assistant_conversations");
}

export function listAssistantMessages(
  conversationId: number,
): Promise<AssistantMessage[]> {
  return invoke("list_assistant_messages", { conversationId });
}

export function renameAssistantConversation(
  id: number,
  title: string,
): Promise<AssistantConversation> {
  return invoke("rename_assistant_conversation", { id, title });
}

export function deleteAssistantConversation(id: number): Promise<void> {
  return invoke("delete_assistant_conversation", { id });
}

export function sendAssistantMessage(
  input: {
    conversationId: number | null;
    model: AssistantModel;
    content: string;
    context: string | null;
    systemInstructions: string | null;
    timezoneOffsetMinutes: number;
  },
  onDelta: (delta: string) => void,
): Promise<AssistantTurn> {
  const onEvent = new Channel<AssistantStreamEvent>();
  onEvent.onmessage = (event) => onDelta(event.delta);
  return invoke("send_assistant_message", { request: input, onEvent });
}

export function listReminders(): Promise<Reminder[]> {
  return invoke("list_reminders");
}

export function createReminder(text: string): Promise<Reminder> {
  return invoke("create_reminder", { text });
}

export function updateReminderText(id: number, text: string): Promise<Reminder> {
  return invoke("update_reminder_text", { id, text });
}

export function setReminderActive(
  id: number,
  active: boolean,
): Promise<Reminder> {
  return invoke("set_reminder_active", { id, active });
}

export function deleteReminder(id: number): Promise<void> {
  return invoke("delete_reminder", { id });
}

export function listMetrics(): Promise<Metric[]> {
  return invoke("list_metrics");
}

export function createMetric(name: string): Promise<Metric> {
  return invoke("create_metric", { name });
}

export function renameMetric(id: number, name: string): Promise<Metric> {
  return invoke("rename_metric", { id, name });
}

export function setMetricIcon(id: number, icon: string): Promise<Metric> {
  return invoke("set_metric_icon", { id, icon });
}

export function setMetricColor(id: number, color: string | null): Promise<Metric> {
  return invoke("set_metric_color", { id, color });
}

export function listPulses(): Promise<Pulse[]> {
  return invoke("list_pulses");
}

export function createPulse(name: string): Promise<Pulse> {
  return invoke("create_pulse", { name });
}

export function renamePulse(id: number, name: string): Promise<Pulse> {
  return invoke("rename_pulse", { id, name });
}

export function setPulseIcon(id: number, icon: string): Promise<Pulse> {
  return invoke("set_pulse_icon", { id, icon });
}

export function deletePulse(id: number): Promise<void> {
  return invoke("delete_pulse", { id });
}

export function addMetricToPulse(
  pulseId: number,
  metricId: number,
): Promise<void> {
  return invoke("add_metric_to_pulse", { pulseId, metricId });
}

export function removeMetricFromPulse(
  pulseId: number,
  metricId: number,
): Promise<void> {
  return invoke("remove_metric_from_pulse", { pulseId, metricId });
}

export function reorderTasks(ids: number[]): Promise<void> {
  return invoke("reorder_tasks", { ids });
}

export function reorderPulses(ids: number[]): Promise<void> {
  return invoke("reorder_pulses", { ids });
}

export function reorderPulseMetrics(
  pulseId: number,
  metricIds: number[],
): Promise<void> {
  return invoke("reorder_pulse_metrics", { pulseId, metricIds });
}

export function listPhases(includeInactive: boolean): Promise<Phase[]> {
  return invoke("list_phases", { includeInactive });
}

export function setPhaseIcon(id: number, icon: string): Promise<Phase> {
  return invoke("set_phase_icon", { id, icon });
}

export function setPhaseColor(id: number, color: string | null): Promise<Phase> {
  return invoke("set_phase_color", { id, color });
}

export function listTasks(): Promise<Task[]> {
  return invoke("list_tasks");
}

export function listTaskDependencies(): Promise<TaskDependency[]> {
  return invoke("list_task_dependencies");
}

export function listTaskStatusEvents(
  from: number,
  to: number,
): Promise<TaskStatusEvent[]> {
  return invoke("list_task_status_events", { from, to });
}

export function createTask(
  title: string,
  description: string,
  status: TaskStatus,
  scope: string | null = null,
  parentTaskId: number | null = null,
): Promise<Task> {
  return invoke("create_task", {
    title,
    description,
    status,
    scope,
    parentTaskId,
  });
}

export function renameTask(id: number, title: string): Promise<Task> {
  return invoke("rename_task", { id, title });
}

export function setTaskDescription(
  id: number,
  description: string,
): Promise<Task> {
  return invoke("set_task_description", { id, description });
}

export function setTaskScope(id: number, scope: string | null): Promise<Task> {
  return invoke("set_task_scope", { id, scope });
}

export function setTaskParent(
  id: number,
  parentTaskId: number | null,
): Promise<Task> {
  return invoke("set_task_parent", { id, parentTaskId });
}

export function addTaskDependency(
  blockerTaskId: number,
  blockedTaskId: number,
): Promise<void> {
  return invoke("add_task_dependency", { blockerTaskId, blockedTaskId });
}

export function removeTaskDependency(
  blockerTaskId: number,
  blockedTaskId: number,
): Promise<void> {
  return invoke("remove_task_dependency", { blockerTaskId, blockedTaskId });
}

export function deleteTask(id: number): Promise<void> {
  return invoke("delete_task", { id });
}

export function setTaskStatus(id: number, status: TaskStatus): Promise<Task> {
  return invoke("set_task_status", { id, status });
}

export function setTaskWorking(id: number, working: boolean): Promise<Task> {
  return invoke("set_task_working", { id, working });
}

export function stopAllWorkingNow(): Promise<Task[]> {
  return invoke("stop_all_working_now");
}

export function listTaskWorkStretches(
  from: number,
  to: number,
): Promise<TaskWorkStretch[]> {
  return invoke("list_task_work_stretches", { from, to });
}

export function updateTaskWorkStretch(
  id: number,
  startedAt: number,
  endedAt: number | null,
): Promise<Task> {
  return invoke("update_task_work_stretch", { id, startedAt, endedAt });
}

export function deleteTaskWorkStretch(id: number): Promise<Task> {
  return invoke("delete_task_work_stretch", { id });
}

export function setTaskScore(
  id: number,
  value: RatingValue | null,
  effort: RatingValue | null,
): Promise<Task> {
  return invoke("set_task_score", { id, value, effort });
}

export function setTaskScoreField(
  id: number,
  field: "value" | "effort",
  score: RatingValue | null,
): Promise<Task> {
  return invoke("set_task_score_field", { id, field, score });
}

export function submitMetricCheckIn(
  pulseId: number,
  ratings: MetricRatingInput[],
): Promise<MetricCheckIn> {
  return invoke("submit_metric_check_in", { pulseId, ratings });
}

export function listMetricCheckIns(
  from: number,
  to: number,
): Promise<MetricCheckInWithRatings[]> {
  return invoke("list_metric_check_ins", { from, to });
}

export function deleteMetricCheckIn(id: number): Promise<void> {
  return invoke("delete_metric_check_in", { id });
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

export function getTimerState(): Promise<TimerState> {
  return invoke("get_timer_state");
}

export function startTimer(minutes: number): Promise<TimerState> {
  return invoke("start_timer", { minutes });
}

export function closePopup(
  dismissed: boolean,
  minutes: number | null = null,
): Promise<void> {
  return invoke("close_popup", { dismissed, minutes });
}

export function showPopup(): Promise<void> {
  return invoke("show_popup");
}

export function showDashboard(): Promise<void> {
  return invoke("show_dashboard");
}

export function submitBrainDump(
  text: string,
  tagIds: number[] = [],
): Promise<BrainDump> {
  return invoke("submit_brain_dump", { text, tagIds });
}

export function listBrainDumps(
  from: number,
  to: number,
  limit?: number,
): Promise<BrainDump[]> {
  return invoke("list_brain_dumps", { from, to, limit: limit ?? null });
}

export function listTags(): Promise<Tag[]> {
  return invoke("list_tags");
}

export function createTag(name: string): Promise<Tag> {
  return invoke("create_tag", { name });
}

export function renameTag(id: number, name: string): Promise<Tag> {
  return invoke("rename_tag", { id, name });
}

export function deleteTag(id: number): Promise<void> {
  return invoke("delete_tag", { id });
}

export function updateBrainDumpTags(
  id: number,
  tagIds: number[],
): Promise<BrainDump> {
  return invoke("update_brain_dump_tags", { id, tagIds });
}

export function logClientEvent(message: string): Promise<void> {
  return invoke("log_client_event", { message });
}

/** Marks that the user started dragging the popup (persist origin on hide). */
export function notePopupDrag(): Promise<void> {
  return invoke("note_popup_drag");
}
