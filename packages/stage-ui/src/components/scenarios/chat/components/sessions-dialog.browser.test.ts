import type { ChatSessionMeta } from '../../../../types/chat-session'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import SessionsDialog from './sessions-dialog.vue'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        stage: {
          chat: {
            sessions: {
              'title': 'Chats',
              'new': 'New chat',
              'empty': 'No chats',
              'delete': 'Delete',
              'cloud-badge': 'Cloud synced',
            },
          },
        },
      },
    },
  })
}

function sessionMeta(sessionId: string, updatedAt: number): ChatSessionMeta {
  return {
    sessionId,
    characterId: 'default',
    userId: 'local',
    createdAt: updatedAt,
    updatedAt,
  }
}

function createHarness() {
  return defineComponent({
    name: 'SessionsDialogHarness',
    components: { SessionsDialog },
    setup() {
      const created = ref(0)
      const selected = ref('none')
      const deleted = ref('none')

      return {
        created,
        deleted,
        selected,
        rows: [
          { meta: sessionMeta('session-one', 2), preview: 'First chat', isActive: true, updatedAtLabel: 'now' },
          { meta: sessionMeta('session-two', 1), preview: 'Second chat', isActive: false, updatedAtLabel: 'yesterday' },
        ],
      }
    },
    template: `
      <SessionsDialog
        :open="true"
        :rows="rows"
        :is-desktop="false"
        :is-creating-session="false"
        mobile-padding-bottom="24px"
        @new-session="created += 1"
        @select-session="selected = $event"
        @delete-session="deleted = $event"
      />
      <output aria-label="created-session-count">{{ created }}</output>
      <output aria-label="selected-session-id">{{ selected }}</output>
      <output aria-label="deleted-session-id">{{ deleted }}</output>
    `,
  })
}

describe('sessions dialog actions', () => {
  // https://github.com/moeru-ai/airi/issues/2085
  it('keeps add, switch, and delete actions independent for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Vaul handled every pointer release on DrawerContent, including releases
    // from its action buttons, and unmounted the sheet before `click` ran.
    // The replacement uses a Reka dialog surface whose buttons emit one action
    // each without a competing gesture-release lifecycle.
    const screen = await render(createHarness(), {
      global: {
        plugins: [createTestI18n()],
      },
    })

    await screen.getByRole('button', { name: 'New chat' }).click()
    await expect.element(screen.getByLabelText('created-session-count')).toHaveTextContent('1')

    await screen.getByRole('button', { name: 'Delete: Second chat' }).click()
    await expect.element(screen.getByLabelText('deleted-session-id')).toHaveTextContent('session-two')
    await expect.element(screen.getByLabelText('selected-session-id')).toHaveTextContent('none')

    await screen.getByRole('button', { name: 'First chat now' }).click()
    await expect.element(screen.getByLabelText('selected-session-id')).toHaveTextContent('session-one')
  })
})
