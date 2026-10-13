import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { featuresConfig } from './features'

/** A fact about the user that the companion keeps across sessions. */
export interface MemoryFact {
  id: string
  text: string
  createdAt: number
}

/**
 * A reminder that the companion says at `dueAt`.
 *
 * `status` is `pending` until the companion has said the reminder. Then it
 * is `done`. The reminder bridge changes the status, the settings page only
 * deletes reminders.
 */
export interface Reminder {
  id: string
  title: string
  dueAt: number
  createdAt: number
  status: 'pending' | 'done'
}

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Memory facts and reminders of the personal companion.
 *
 * The state is persisted in local storage. Each window has its own store
 * instance, and local storage events keep the instances equal. So the
 * settings window shows the facts that the main window adds.
 */
export const usePersonalCompanionStore = defineStore('personal-companion', () => {
  const facts = useLocalStorage<MemoryFact[]>('personal/memory-facts', [])
  const reminders = useLocalStorage<Reminder[]>('personal/reminders', [])

  const pendingReminders = computed(() => reminders.value
    .filter(reminder => reminder.status === 'pending')
    .sort((a, b) => a.dueAt - b.dueAt))

  /**
   * Adds a fact unless the same text is already stored, ignoring case and spaces.
   * When the store has more than `memory.maxFacts` facts, the oldest facts are removed.
   */
  function addFact(text: string) {
    const trimmed = text.trim()
    if (!trimmed)
      return
    const normalized = normalizeText(trimmed)
    if (facts.value.some(fact => normalizeText(fact.text) === normalized))
      return

    const next = [...facts.value, { id: nanoid(), text: trimmed, createdAt: Date.now() }]
    facts.value = next.slice(-featuresConfig.memory.maxFacts)
  }

  function removeFact(id: string) {
    facts.value = facts.value.filter(fact => fact.id !== id)
  }

  /** Adds a pending reminder unless a pending reminder with the same title and time exists. */
  function addReminder(title: string, dueAt: number) {
    const trimmed = title.trim()
    if (!trimmed)
      return
    const normalized = normalizeText(trimmed)
    if (pendingReminders.value.some(reminder => reminder.dueAt === dueAt && normalizeText(reminder.title) === normalized))
      return

    reminders.value = [...reminders.value, { id: nanoid(), title: trimmed, dueAt, createdAt: Date.now(), status: 'pending' }]
  }

  function markReminderDone(id: string) {
    reminders.value = reminders.value.map(reminder => reminder.id === id ? { ...reminder, status: 'done' } : reminder)
  }

  function removeReminder(id: string) {
    reminders.value = reminders.value.filter(reminder => reminder.id !== id)
  }

  return {
    facts,
    reminders,
    pendingReminders,
    addFact,
    removeFact,
    addReminder,
    markReminderDone,
    removeReminder,
  }
})
