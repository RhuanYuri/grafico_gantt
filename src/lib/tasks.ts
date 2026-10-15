import type { Task } from '../types'
import { shiftISO } from './dates'

export function dependsOn(tasks: Task[], id: string, targetId: string, seen = new Set<string>()): boolean {
  if (seen.has(id)) return false
  seen.add(id)
  const t = tasks.find((x) => x.id === id)
  if (!t) return false
  return t.predecessors.some((p) => p.taskId === targetId || dependsOn(tasks, p.taskId, targetId, seen))
}

/** Tarefas que podem ser predecessoras de `taskId` sem criar ciclos. */
export function eligiblePredecessors(tasks: Task[], taskId: string | null): Task[] {
  return tasks.filter((t) => t.id !== taskId && (taskId === null || !dependsOn(tasks, t.id, taskId)))
}

export function moveTask(task: Task, delta: number): Task {
  return { ...task, start: shiftISO(task.start, delta), end: shiftISO(task.end, delta) }
}

export function removeTask(tasks: Task[], id: string): Task[] {
  return tasks
    .filter((t) => t.id !== id)
    .map((t) => ({ ...t, predecessors: t.predecessors.filter((p) => p.taskId !== id) }))
}

export function upsertTask(tasks: Task[], task: Task): Task[] {
  const i = tasks.findIndex((t) => t.id === task.id)
  if (i === -1) return [...tasks, task]
  const next = tasks.slice()
  next[i] = task
  return next
}
