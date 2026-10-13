import { useCharacterNotebookStore, useCharacterStore } from '@proj-airi/stage-ui/stores/character'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { usePersonalCompanionStore } from './companion-store'
import { installReminderBridge } from './reminders'

// The character store reads translations with `useI18n`, which needs a component setup.
// The same mock is in the character store tests of stage-ui.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('installReminderBridge', () => {
  let stop: (() => void) | undefined

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    stop?.()
    vi.useRealTimers()
  })

  it('adds pending reminders to the notebook, also those saved before the start', async () => {
    const companion = usePersonalCompanionStore()
    const notebook = useCharacterNotebookStore()
    companion.addReminder('Stretch', 1000)

    stop = installReminderBridge()
    companion.addReminder('Drink water', 2000)
    await nextTick()

    expect(notebook.tasks.map(task => [task.title, task.dueAt, task.status])).toEqual([
      ['Stretch', 1000, 'scheduled'],
      ['Drink water', 2000, 'scheduled'],
    ])
  })

  it('closes the reminder after the companion reacts to its task', async () => {
    const companion = usePersonalCompanionStore()
    const notebook = useCharacterNotebookStore()
    const character = useCharacterStore()
    companion.addReminder('Stretch', 1000)
    stop = installReminderBridge()

    character.recordSparkNotifyReaction(`task-${notebook.tasks[0].id}`, 'Time to stretch!')
    await nextTick()

    expect(companion.pendingReminders).toEqual([])
    expect(notebook.tasks[0].status).toBe('done')
  })

  it('closes the task of a reminder that is deleted in Settings', async () => {
    const companion = usePersonalCompanionStore()
    const notebook = useCharacterNotebookStore()
    companion.addReminder('Stretch', 1000)
    stop = installReminderBridge()

    companion.removeReminder(companion.reminders[0].id)
    await nextTick()

    expect(notebook.tasks[0].status).toBe('done')
  })

  it('closes a reminder that the companion did not say within three minutes of the first try', async () => {
    const companion = usePersonalCompanionStore()
    const notebook = useCharacterNotebookStore()
    companion.addReminder('Stretch', Date.now())
    stop = installReminderBridge()
    notebook.markTaskNotified(notebook.tasks[0].id)

    vi.advanceTimersByTime(60_000)
    expect(companion.pendingReminders).toHaveLength(1)

    vi.advanceTimersByTime(3 * 60_000)
    expect(companion.pendingReminders).toEqual([])
    expect(notebook.tasks[0].status).toBe('done')
  })
})
