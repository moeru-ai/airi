import type { ChatSessionMeta } from '../../../../types/chat-session'

import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import SessionsDrawer from './sessions-drawer.vue'

import { useChatStore } from '../../../../stores/chat'
import { useChatSessionStore } from '../../../../stores/chat/session-store'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: {
        stage: {
          chat: {
            sessions: {
              'title': 'Chats',
              'new': 'New chat',
              'empty': 'No chats',
              'delete': 'Delete',
              'current': 'Current',
              'cancel': 'Cancel',
              'confirm-delete': 'Delete this conversation and its messages?',
              'cloud-badge': 'Cloud synced',
            },
          },
        },
      },
    },
  })
}

function sessionMeta(sessionId: string, title: string, updatedAt: number): ChatSessionMeta {
  return {
    sessionId,
    title,
    characterId: 'default',
    userId: 'local',
    createdAt: updatedAt,
    updatedAt,
  }
}

function createSessionsPinia() {
  const pinia = createPinia()
  pinia.state.value = {
    'chat-session-selection': {
      activeSessionId: 'session-b',
    },
    'chat-session': {
      sessionMetas: {
        'session-a': sessionMeta('session-a', 'Chat A', 1),
        'session-b': sessionMeta('session-b', 'Chat B', 3),
        'session-c': sessionMeta('session-c', 'Chat C', 2),
      },
      sessionMessages: {
        'session-a': [],
        'session-b': [],
        'session-c': [],
      },
    },
  }
  return pinia
}

describe('sessions drawer orchestration', () => {
  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743073795
  it('preserves a newer selection while active-session deletion is pending for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Deletion captured that B was active, then unconditionally selected its
    // fallback after the asynchronous leader action completed. A user choice
    // of C made during that await was therefore overwritten by stale work.
    const pinia = createSessionsPinia()

    const screen = await render(SessionsDrawer, {
      props: { modelValue: false },
      global: {
        plugins: [pinia, PiniaColada, createTestI18n()],
      },
    })
    const chatSession = useChatSessionStore(pinia)
    const chat = useChatStore(pinia)
    let resolveDelete: (() => void) | undefined
    vi.spyOn(chat, 'deleteSession').mockImplementationOnce(() => new Promise((resolve) => {
      resolveDelete = resolve
    }))
    vi.spyOn(chatSession, 'loadSession').mockResolvedValue(true)
    vi.spyOn(chatSession, 'setActiveSession').mockImplementation(async (sessionId) => {
      chatSession.activeSessionId = sessionId
    })
    await screen.rerender({ modelValue: true })

    await screen.getByRole('button', { name: 'Delete: Chat B' }).click()
    await screen.getByRole('button', { name: 'Delete', exact: true }).click()
    await vi.waitFor(() => expect(chat.deleteSession).toHaveBeenCalledWith('session-b'))

    await screen.getByRole('button', { name: /^Chat C/ }).click()
    expect(chatSession.activeSessionId).toBe('session-c')

    resolveDelete?.()
    await vi.waitFor(() => expect(chatSession.setActiveSession).toHaveBeenCalledTimes(1))

    expect(chatSession.setActiveSession).toHaveBeenLastCalledWith('session-c')
    expect(chatSession.activeSessionId).toBe('session-c')
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743221030
  it('preserves a newer selection while session creation is pending for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // New-session creation awaited leader persistence, then unconditionally
    // selected its result. Session rows stay enabled during that wait, so a
    // newer row selection was overwritten when creation eventually resolved.
    const pinia = createSessionsPinia()
    const screen = await render(SessionsDrawer, {
      props: { modelValue: false },
      global: {
        plugins: [pinia, PiniaColada, createTestI18n()],
      },
    })
    const chatSession = useChatSessionStore(pinia)
    let resolveCreate: ((sessionId: string) => void) | undefined
    vi.spyOn(chatSession, 'createSession').mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    vi.spyOn(chatSession, 'loadSession').mockResolvedValue(true)
    vi.spyOn(chatSession, 'setActiveSession').mockImplementation(async (sessionId) => {
      chatSession.activeSessionId = sessionId
    })
    await screen.rerender({ modelValue: true })

    await screen.getByRole('button', { name: 'New chat' }).click()
    await vi.waitFor(() => expect(chatSession.createSession).toHaveBeenCalledWith('default', { setActive: false }))

    await screen.getByRole('button', { name: /^Chat C/ }).click()
    expect(chatSession.activeSessionId).toBe('session-c')

    resolveCreate?.('session-new')
    await vi.waitFor(() => expect(chatSession.setActiveSession).toHaveBeenCalledTimes(1))

    expect(chatSession.setActiveSession).toHaveBeenLastCalledWith('session-c')
    expect(chatSession.activeSessionId).toBe('session-c')
  })
})
