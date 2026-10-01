import { invoke } from "@tauri-apps/api/core";
import type { BrainDump, Tag } from "../types";

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
