import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import SignOutBody from './sign-out-body.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        settings: {
          dialogs: {
            signOut: {
              description: 'End this account session.',
              keep: {
                label: 'Keep data',
              },
              reset: {
                warning: 'This cannot be undone',
                description: 'All local data will be deleted.',
              },
              cancel: 'Cancel',
              title: 'Sign out',
              titleReset: 'Sign out and reset',
            },
          },
        },
      },
    },
  })
}

function createHarness() {
  return defineComponent({
    name: 'SignOutBodyHarness',
    components: { SignOutBody },
    setup() {
      const keepData = ref(true)
      const confirmed = ref(0)
      const cancelled = ref(0)

      return {
        keepData,
        confirmed,
        cancelled,
      }
    },
    template: `
      <SignOutBody
        v-model:keep-data="keepData"
        :loading="false"
        :error="null"
        @confirm="confirmed += 1"
        @cancel="cancelled += 1"
      />
      <output aria-label="confirmed-count">{{ confirmed }}</output>
      <output aria-label="cancelled-count">{{ cancelled }}</output>
    `,
  })
}

describe('sign-out body keep-data toggle', () => {
  it('keeps data on by default and only warns after the switch is turned off', async () => {
    const screen = await render(createHarness(), {
      global: {
        plugins: [createTestI18n()],
      },
    })

    await expect.element(screen.getByRole('switch', { name: /keep data/i })).toBeChecked()
    await expect.element(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await expect.element(screen.getByText('This cannot be undone')).not.toBeInTheDocument()

    await screen.getByRole('switch', { name: /keep data/i }).click()

    await expect.element(screen.getByRole('switch', { name: /keep data/i })).not.toBeChecked()
    await expect.element(screen.getByText('This cannot be undone')).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Sign out and reset' })).toBeVisible()

    await screen.getByRole('button', { name: 'Sign out and reset' }).click()
    await expect.element(screen.getByLabelText('confirmed-count')).toHaveTextContent('1')

    await screen.getByRole('button', { name: 'Cancel' }).click()
    await expect.element(screen.getByLabelText('cancelled-count')).toHaveTextContent('1')
  })
})
