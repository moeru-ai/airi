import type { ChatSessionMeta } from '@proj-airi/stage-ui/types/chat-session'
import type { Component } from 'vue'

import SharedInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/InteractiveArea'
import MobileInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/MobileInteractiveArea'
import ChatArea from '@proj-airi/stage-layouts/components/Widgets/ChatArea'

import { PiniaColada } from '@pinia/colada'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import InteractiveArea from './InteractiveArea.vue'

function createTestI18n() {
  return createI18n({
    fallbackWarn: false,
    legacy: false,
    locale: 'en',
    messages: { en: {} },
    missingWarn: false,
  })
}

async function renderArea(component: Component = InteractiveArea) {
  const sessionB: ChatSessionMeta = {
    characterId: 'default',
    createdAt: 1,
    sessionId: 'session-b',
    updatedAt: 1,
    userId: 'local',
  }
  const sessionA: ChatSessionMeta = {
    ...sessionB,
    createdAt: 2,
    sessionId: 'session-a',
    updatedAt: 2,
  }
  const pinia = createPinia()
  pinia.state.value = {
    'chat-session': {
      sessionMessages: {
        'session-a': [{ content: 'session A prompt', id: 'system-a', role: 'system' }],
        'session-b': [{ content: 'system prompt', id: 'system', role: 'system' }],
      },
      sessionMetas: { 'session-a': sessionA, 'session-b': sessionB },
    },
    'chat-session-selection': { activeSessionId: 'session-b' },
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ component: { template: '<div />' }, path: '/' }],
  })
  await router.push('/')
  await router.isReady()

  const screen = await render(component, {
    global: { plugins: [pinia, PiniaColada, createTestI18n(), router] },
  })
  return {
    chat: useChatStore(pinia),
    chatSession: useChatSessionStore(pinia),
    chatStream: useChatStreamStore(pinia),
    screen,
  }
}

async function submitDraft(screen: Awaited<ReturnType<typeof renderArea>>['screen'], draft: string) {
  const input = screen.getByRole('textbox')
  await userEvent.fill(input, draft)
  await userEvent.click(input)
  await userEvent.keyboard('{Enter}')
  return input
}

describe('interactive area synchronized state', () => {
  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743121861
  it('renders the active synchronized stream through the real chat history for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // A follower received the leader-owned active stream in the real chat
    // store, but InteractiveArea passed its unrelated foreground stream to
    // ChatHistory. Mocking either store or component hid that broken binding.
    const { chat, chatStream, screen } = await renderArea()
    chat.$patch({
      activeSendSessionId: 'session-b',
      activeStreamingMessage: {
        content: 'Follower B live response',
        createdAt: 2,
        id: 'follower-b-stream',
        role: 'assistant',
        slices: [{ text: 'Follower B live response', type: 'text' }],
        tool_results: [],
      },
      sending: true,
    })
    chatStream.$patch({
      streamingMessage: {
        content: 'Leader A foreground response',
        createdAt: 3,
        id: 'leader-a-stream',
        role: 'assistant',
        slices: [{ text: 'Leader A foreground response', type: 'text' }],
        tool_results: [],
      },
    })
    await nextTick()

    await expect.element(screen.getByText('Follower B live response')).toBeVisible()
    await expect.element(screen.getByText('Leader A foreground response')).not.toBeInTheDocument()
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743309235
  it('scopes the mobile synchronized stream to its local session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // MobileInteractiveArea passed the synchronized global sending state and
    // foreground stream directly to ChatHistory. A mobile window on session B
    // therefore rendered the live response from a send targeting session A.
    const { chat, chatStream, screen } = await renderArea(MobileInteractiveArea)
    chat.$patch({
      activeSendSessionId: 'session-a',
      activeStreamingMessage: {
        content: 'Session A live response',
        createdAt: 2,
        id: 'session-a-stream',
        role: 'assistant',
        slices: [{ text: 'Session A live response', type: 'text' }],
        tool_results: [],
      },
      sending: true,
    })
    chatStream.$patch({
      streamingMessage: {
        content: 'Session A live response',
        createdAt: 2,
        id: 'session-a-foreground',
        role: 'assistant',
        slices: [{ text: 'Session A live response', type: 'text' }],
        tool_results: [],
      },
    })
    await nextTick()
    await expect.element(screen.getByText('Session A live response')).not.toBeInTheDocument()

    chat.$patch({
      activeSendSessionId: 'session-b',
      activeStreamingMessage: {
        content: 'Session B live response',
        createdAt: 3,
        id: 'session-b-stream',
        role: 'assistant',
        slices: [{ text: 'Session B live response', type: 'text' }],
        tool_results: [],
      },
    })
    await nextTick()
    await expect.element(screen.getByText('Session B live response')).toBeVisible()
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743366443
  it('scopes the stage-web desktop synchronized stream to its local session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // The shared desktop layout derived sending from the target session but
    // still passed the leader foreground stream to ChatHistory. A web window
    // on B could therefore append A's live response.
    const { chat, chatStream, screen } = await renderArea(SharedInteractiveArea)
    chat.$patch({
      activeSendSessionId: 'session-b',
      activeStreamingMessage: {
        content: 'Session B web response',
        createdAt: 2,
        id: 'session-b-web-stream',
        role: 'assistant',
        slices: [{ text: 'Session B web response', type: 'text' }],
        tool_results: [],
      },
      sending: true,
    })
    chatStream.$patch({
      streamingMessage: {
        content: 'Session A foreground response',
        createdAt: 3,
        id: 'session-a-web-foreground',
        role: 'assistant',
        slices: [{ text: 'Session A foreground response', type: 'text' }],
        tool_results: [],
      },
    })
    await nextTick()

    await expect.element(screen.getByText('Session B web response')).toBeVisible()
    await expect.element(screen.getByText('Session A foreground response')).not.toBeInTheDocument()
  })

  it('routes a stage-web send through the synchronized chat action', async () => {
    const { chat, screen } = await renderArea(SharedInteractiveArea)
    const send = vi.spyOn(chat, 'send').mockResolvedValueOnce({ messages: [], sessionId: 'session-b' })

    await submitDraft(screen, 'web follower message')

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({
      sessionId: 'session-b',
      text: 'web follower message',
    }))
  })

  it('routes a mobile send through the synchronized chat action', async () => {
    const { chat, screen } = await renderArea(MobileInteractiveArea)
    const send = vi.spyOn(chat, 'send').mockResolvedValueOnce({ messages: [], sessionId: 'session-b' })

    await submitDraft(screen, 'mobile follower message')

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({
      sessionId: 'session-b',
      text: 'mobile follower message',
    }))
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3755530944
  it('keeps a failed mobile draft out of a newly selected session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Shared layouts restored a rejected send into their component-wide input
    // without checking whether the window still displayed the target session.
    const { chat, chatSession, screen } = await renderArea(MobileInteractiveArea)
    let rejectSend: ((error: Error) => void) | undefined
    vi.spyOn(chat, 'send').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject
    }))

    const input = await submitDraft(screen, 'mobile draft from B')
    chatSession.activeSessionId = 'session-a'
    rejectSend?.(new Error('send failed'))

    await expect.element(input).toHaveValue('')
  })

  it('does not restore a deleted-session draft in the shared chat widget', async () => {
    const { chat, screen } = await renderArea(ChatArea)
    let rejectSend: ((error: Error) => void) | undefined
    vi.spyOn(chat, 'send').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject
    }))

    const input = await submitDraft(screen, 'deleted web draft')
    rejectSend?.(new Error('Chat session was removed before send completed'))

    await expect.element(input).toHaveValue('')
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3628804992
  it('does not restore a failed draft into a newly selected session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Failure recovery used the reactive selection instead of the session
    // captured by the send, so a late rejection could move a draft.
    const { chat, chatSession, screen } = await renderArea()
    let rejectSend: ((error: Error) => void) | undefined
    vi.spyOn(chat, 'send').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject
    }))

    const input = await submitDraft(screen, 'send from B')
    await expect.element(input).toHaveValue('')
    chatSession.activeSessionId = 'session-a'
    rejectSend?.(new Error('hydrate failed'))

    await expect.element(input).toHaveValue('')
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3629004140
  it('restores a failed draft when its captured session is still active for Issue #2085', async () => {
    const { chat, screen } = await renderArea()
    vi.spyOn(chat, 'send').mockRejectedValueOnce(new Error('send failed'))

    const input = await submitDraft(screen, 'retry this draft')
    await expect.element(input).toHaveValue('retry this draft')
  })

  it('keeps a newer draft when an earlier send fails', async () => {
    // ROOT CAUSE:
    //
    // Failure recovery replaced the textarea unconditionally. Text entered
    // while the request was pending was lost with its attachment previews.
    const { chat, screen } = await renderArea()
    let rejectSend: ((error: Error) => void) | undefined
    vi.spyOn(chat, 'send').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject
    }))

    const input = await submitDraft(screen, 'first draft')
    await userEvent.fill(input, 'newer draft')
    rejectSend?.(new Error('send failed'))

    await expect.element(input).toHaveValue('first draft\nnewer draft')
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743366446
  it('discards a queued draft when deletion cancels its send for Issue #2085', async () => {
    const { chat, screen } = await renderArea()
    let rejectSend: ((error: Error) => void) | undefined
    vi.spyOn(chat, 'send').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject
    }))

    const input = await submitDraft(screen, 'discard this deleted draft')
    rejectSend?.(new Error('Chat session was reset before send could start'))

    await expect.element(input).toHaveValue('')
  })
})
