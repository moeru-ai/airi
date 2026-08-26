import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface NotebookEntry {
  createdAt: number
  id: string
  kind: NotebookEntryKind
  metadata?: Record<string, unknown>
  tags?: string[]
  text: string
}

export type NotebookEntryKind = 'diary' | 'focus' | 'note'

export interface ScheduledTask {
  createdAt: number
  details?: string
  dueAt?: number
  id: string
  lastNotifiedAt?: number
  metadata?: Record<string, unknown>
  nextNotifyAt?: number
  priority: TaskPriority
  status: TaskStatus
  title: string
  updatedAt: number
}
export type TaskPriority = 'critical' | 'high' | 'low' | 'normal'

export type TaskStatus = 'done' | 'dropped' | 'queued' | 'scheduled'

export const useCharacterNotebookStore = defineStore('character-notebook', () => {
  const entries = ref<NotebookEntry[]>([])
  const tasks = ref<ScheduledTask[]>([])

  const partitionDiary = computed(() => entries.value.filter(entry => entry.kind === 'diary'))
  const partitionFocus = computed(() => entries.value.filter(entry => entry.kind === 'focus'))

  function addEntry(kind: NotebookEntryKind, text: string, options?: { metadata?: Record<string, unknown>, tags?: string[] }) {
    const entry: NotebookEntry = {
      createdAt: Date.now(),
      id: nanoid(),
      kind,
      metadata: options?.metadata,
      tags: options?.tags,
      text,
    }

    entries.value.push(entry)
    return entry
  }

  function addNote(text: string, options?: { metadata?: Record<string, unknown>, tags?: string[] }) {
    return addEntry('note', text, options)
  }

  function addDiaryEntry(text: string, options?: { metadata?: Record<string, unknown>, tags?: string[] }) {
    return addEntry('diary', text, options)
  }

  function addFocusEntry(text: string, options?: { metadata?: Record<string, unknown>, tags?: string[] }) {
    return addEntry('focus', text, options)
  }

  function scheduleTask(payload: {
    details?: string
    dueAt?: number
    metadata?: Record<string, unknown>
    priority?: TaskPriority
    title: string
  }) {
    const now = Date.now()
    const task: ScheduledTask = {
      createdAt: now,
      details: payload.details,
      dueAt: payload.dueAt,
      id: nanoid(),
      metadata: payload.metadata,
      priority: payload.priority ?? 'normal',
      status: payload.dueAt ? 'scheduled' : 'queued',
      title: payload.title,
      updatedAt: now,
    }

    tasks.value.push(task)
    return task
  }

  function markTaskDone(taskId: string) {
    const task = tasks.value.find(item => item.id === taskId)
    if (!task)
      return

    task.status = 'done'
    task.updatedAt = Date.now()
  }

  function requeueTask(taskId: string, options?: { dueAt?: number, reason?: string }) {
    const task = tasks.value.find(item => item.id === taskId)
    if (!task)
      return

    task.status = 'queued'
    task.dueAt = options?.dueAt
    task.updatedAt = Date.now()
    task.metadata = {
      ...task.metadata,
      requeueReason: options?.reason,
    }
  }

  function markTaskNotified(taskId: string, nextNotifyAt?: number) {
    const task = tasks.value.find(item => item.id === taskId)
    if (!task)
      return

    task.lastNotifiedAt = Date.now()
    task.nextNotifyAt = nextNotifyAt
    task.updatedAt = Date.now()
  }

  function getDueTasks(now: number, windowMs: number) {
    return tasks.value.filter((task) => {
      if (task.status === 'done' || task.status === 'dropped')
        return false
      const dueAt = task.dueAt ?? now
      if (dueAt > now + windowMs)
        return false
      if (typeof task.nextNotifyAt === 'number' && task.nextNotifyAt > now)
        return false
      return true
    })
  }

  return {
    addDiaryEntry,
    addFocusEntry,
    addNote,
    entries,
    getDueTasks,
    markTaskDone,
    markTaskNotified,
    partitionDiary,
    partitionFocus,
    requeueTask,
    scheduleTask,
    tasks,
  }
})
