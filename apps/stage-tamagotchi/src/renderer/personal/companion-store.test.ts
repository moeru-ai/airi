import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { usePersonalCompanionStore } from './companion-store'
import { featuresConfig } from './features'

describe('usePersonalCompanionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not add a fact twice, ignoring case and spaces', () => {
    const store = usePersonalCompanionStore()

    store.addFact('The user likes tea.')
    store.addFact('  the user  LIKES tea. ')

    expect(store.facts.map(fact => fact.text)).toEqual(['The user likes tea.'])
  })

  it('removes the oldest facts above the configured limit', () => {
    const store = usePersonalCompanionStore()
    const count = featuresConfig.memory.maxFacts + 2

    for (let index = 0; index < count; index++)
      store.addFact(`Fact ${index}`)

    expect(store.facts).toHaveLength(featuresConfig.memory.maxFacts)
    expect(store.facts[0].text).toBe('Fact 2')
  })

  it('keeps one pending reminder for the same title and time', () => {
    const store = usePersonalCompanionStore()

    store.addReminder('Stretch', 1000)
    store.addReminder('stretch', 1000)
    store.addReminder('Stretch', 2000)

    expect(store.pendingReminders.map(reminder => reminder.dueAt)).toEqual([1000, 2000])
  })

  it('removes done reminders from the pending list', () => {
    const store = usePersonalCompanionStore()
    store.addReminder('Stretch', 1000)

    store.markReminderDone(store.reminders[0].id)

    expect(store.pendingReminders).toEqual([])
    expect(store.reminders[0].status).toBe('done')
  })
})
