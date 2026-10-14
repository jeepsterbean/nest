import type { Task } from "../lib/types";

export function replaceTask(tasks: Task[], updated: Task): Task[] {
  return tasks.map((task) => (task.id === updated.id ? updated : task));
}

export function appendTaskOnce(tasks: Task[], created: Task): Task[] {
  return tasks.some((task) => task.id === created.id)
    ? tasks
    : [...tasks, created];
}

export function placeChildAfterParent(
  tasks: Task[],
  parentId: number,
  child: Task,
): Task[] {
  const withoutChild = tasks.filter((task) => task.id !== child.id);
  const parentIndex = withoutChild.findIndex((task) => task.id === parentId);
  if (parentIndex < 0) return appendTaskOnce(tasks, child);
  const currentChild = tasks.find((task) => task.id === child.id) ?? child;
  return [
    ...withoutChild.slice(0, parentIndex + 1),
    currentChild,
    ...withoutChild.slice(parentIndex + 1),
  ];
}
