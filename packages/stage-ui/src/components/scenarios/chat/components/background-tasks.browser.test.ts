import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ChatBackgroundTasks from './background-tasks.vue'

describe('chat background tasks', () => {
  // A background task is visible and stoppable from the composer.
  it('lists each task and asks to stop a running one', async () => {
    const running = { sessionId: 'recipe-session', turnId: 'turn-1', recipeName: 'Research', status: 'running' as const }
    const screen = await render(ChatBackgroundTasks, {
      props: { tasks: [running] },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })

    expect(screen.container.textContent).toContain('Working on')
    expect(screen.container.textContent).toContain('Research')

    await screen.getByRole('button', { name: 'Stop Research' }).click()

    expect(screen.emitted('stop')).toEqual([[running]])
  })

  // A finished task keeps its result in the list until the owner dismisses it.
  it('shows how a finished task ended and asks to dismiss it', async () => {
    const failed = { sessionId: 'recipe-session', recipeName: 'Research', status: 'failed' as const }
    const screen = await render(ChatBackgroundTasks, {
      props: { tasks: [failed] },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })

    expect(screen.container.textContent).toContain('Failed')

    await screen.getByRole('button', { name: 'Dismiss Research' }).click()

    expect(screen.emitted('dismiss')).toEqual([[failed]])
    expect(screen.emitted('stop')).toBeUndefined()
  })
})
