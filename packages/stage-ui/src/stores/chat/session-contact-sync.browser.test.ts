import type { ContactSnapshot } from '@proj-airi/server-sdk-shared/contacts'

import type { RemoteChat } from '../../libs/chat-sync'
import type { ChatSessionMeta } from '../../types/chat-session'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { literal, parse, strictObject, string } from 'valibot'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createApp } from 'vue'

import SessionsDrawer from '../../components/scenarios/chat/components/sessions-drawer.vue'

import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'
import { storage } from '../../database/storage'
import { UNBOUND_SESSION_GROUP } from '../../types/chat-session'
import { useAuthStore } from '../auth'
import { useAiriCardStore } from '../modules/airi-card'
import { useAiriCardCatalog } from '../modules/airi-card-catalog'
import { useChatSessionStore } from './session-store'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'en' }, t: (key: string) => key }) }))

const instances: ReturnType<typeof createPinia>[] = []
const timestamp = '2026-09-28T00:00:00.000Z'

function contact(localId: string): ContactSnapshot {
  return {
    id: `contact-${localId}`,
    ownerId: 'owner',
    characterId: `hosted-${localId}`,
    localCharacterId: localId,
    revision: 1,
    lastMutationId: 'import',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    document: {
      name: localId,
      version: '1',
      extensions: {
        airi: {
          modules: {
            consciousness: { provider: '', model: '' },
            vision: { provider: '', model: '' },
            speech: { provider: '', model: '', voice_id: '' },
          },
          agents: {},
        },
      },
    },
  }
}

function remote(id: string, contactId: string | null): RemoteChat {
  return { id, type: 'bot', title: id, contactId, contactOwnerId: contactId ? 'owner' : null, createdAt: timestamp, updatedAt: timestamp }
}

async function context(remoteContacts: ContactSnapshot[], remoteChats: RemoteChat[]) {
  const fetchAsset = globalThis.fetch.bind(globalThis)
  const requests: Request[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.origin === location.origin)
      return fetchAsset(input, init)
    requests.push(request)
    if (request.method === 'GET' && url.pathname === '/api/v1/contacts')
      return Response.json({ contacts: remoteContacts })
    if (request.method === 'GET' && url.pathname === '/api/v1/chats')
      return Response.json({ chats: remoteChats })
    if (request.method === 'POST' && url.pathname === '/api/v1/chats') {
      const input = parse(strictObject({ id: string(), type: literal('bot'), contactId: string() }), await request.clone().json())
      const created = remote(input.id, input.contactId)
      remoteChats.push(created)
      return Response.json(created, { status: 201 })
    }
    if (request.method === 'POST' && url.pathname.endsWith('/contact')) {
      const input = parse(strictObject({ contactId: string() }), await request.clone().json())
      const id = decodeURIComponent(url.pathname.split('/').at(-2)!)
      const chat = remoteChats.find(chat => chat.id === id)
      if (!chat || chat.type !== 'bot')
        return Response.json({ message: 'Not an owned direct conversation' }, { status: 400 })
      chat.contactId = input.contactId
      chat.contactOwnerId = 'owner'
      return Response.json(chat)
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/api/v1/chats/'))
      return new Response(null, { status: 204 })
    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`)
  }))
  const pinia = createPinia()
  createApp({}).use(pinia).use(PiniaColada)
  instances.push(pinia)
  const auth = useAuthStore(pinia)
  auth.user = { id: 'owner', name: 'Owner', email: 'owner@example.test', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
  auth.token = 'test-token'
  const cards = useAiriCardStore(pinia)
  await cards.initialize()
  const chats = useChatSessionStore(pinia)
  return { pinia, cards, chats, requests, catalog: useAiriCardCatalog(pinia) }
}

beforeEach(async () => {
  localStorage.clear()
  await storage.clear('local')
})

afterEach(() => {
  for (const pinia of instances.splice(0)) {
    useChatSessionStore(pinia).dispose()
    disposePinia(pinia)
  }
  vi.unstubAllGlobals()
})

describe('contact-owned cloud conversation restoration', () => {
  it('does not replace a newer selected history when assignment finishes', async () => {
    const { pinia, chats } = await context([contact('default')], [remote('first-history', null), remote('newer-history', null)])
    await chats.synchronizeContacts()
    await chats.setActiveSession('first-history')
    const gate = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const fetchRemote = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init)
      if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/contact')) {
        started.resolve()
        await gate.promise
      }
      return fetchRemote(input, init)
    }))
    const screen = render(SessionsDrawer, {
      props: { modelValue: true },
      global: { plugins: [pinia, PiniaColada] },
    })
    await screen.getByRole('button', { name: 'stage.chat.sessions.unbound', exact: true }).click()
    await screen.getByRole('button', { name: 'stage.chat.sessions.assign', exact: true }).click()
    await started.promise
    await chats.setActiveSession('newer-history')
    gate.resolve()
    await expect.poll(() => chats.sessionMetas['first-history'].characterId).toBe('default')
    await expect.element(screen.getByRole('button', { name: 'stage.chat.sessions.assign', exact: true })).not.toBeDisabled()
    expect(chats.activeSessionId).toBe('newer-history')
  })

  it('explicitly assigns an unbound direct history without losing its messages and refuses groups', async () => {
    const { chats, requests } = await context([contact('default'), contact('luna')], [remote('unbound', null), { ...remote('group', null), type: 'group' }])
    await chats.synchronizeContacts()
    const messages = [{ id: 'history', role: 'user' as const, content: 'Preserve before assignment' }]
    await chatSessionsRepo.saveSession('unbound', { meta: JSON.parse(JSON.stringify(chats.sessionMetas.unbound)), messages })
    await chats.assignConversation('unbound', 'luna')
    expect(chats.sessionMetas.unbound).toMatchObject({ characterId: 'luna', contactId: 'contact-luna' })
    expect(chats.index?.characters[UNBOUND_SESSION_GROUP].sessions.unbound).toBeUndefined()
    expect(chats.index?.characters.luna.sessions.unbound.sessionId).toBe('unbound')
    expect((await chatSessionsRepo.getSession('unbound'))?.messages).toEqual(messages)
    expect(await requests.find(request => new URL(request.url).pathname.endsWith('/contact'))?.json()).toEqual({ contactId: 'contact-luna' })
    await expect(chats.assignConversation('group', 'luna')).rejects.toThrow('Only unbound direct conversations')
  })

  it('creates cloud conversations through the contact identity, not caller-supplied members', async () => {
    const { chats, requests } = await context([contact('default'), contact('luna')], [])
    await chats.synchronizeContacts()
    const id = await chats.createCharacterSession('luna', { setActive: false })
    await expect.poll(() => chats.sessionMetas[id]?.cloudChatId).toBe(id)
    expect(chats.sessionMetas[id].contactId).toBe('contact-luna')
    const created = requests.find(request => request.method === 'POST')
    expect(await created?.json()).toEqual({ id, type: 'bot', contactId: 'contact-luna' })
  })

  it('moves verified history to its contact without overwriting unloaded messages or guessing unbound roles', async () => {
    const meta: ChatSessionMeta = { sessionId: 'old', userId: 'owner', characterId: 'default', cloudChatId: 'old', createdAt: 1, updatedAt: 2 }
    const messages = [{ id: 'preserved-message', role: 'user' as const, content: 'Keep this text' }]
    await chatSessionsRepo.saveIndex({ userId: 'owner', characters: { default: { activeSessionId: 'old', sessions: { old: meta } } } })
    await chatSessionsRepo.saveSession('old', { meta, messages })
    const { chats, cards, requests } = await context([contact('default'), contact('luna')], [
      remote('old', 'contact-luna'),
      remote('ambiguous', null),
      { ...remote('group', null), type: 'group' },
    ])
    await chats.synchronizeContacts()
    expect(cards.cards.has('luna')).toBe(true)
    expect(chats.sessionMetas.old).toMatchObject({ characterId: 'luna', contactId: 'contact-luna' })
    expect(chats.index?.characters.default.sessions.old).toBeUndefined()
    expect(chats.index?.characters.luna.sessions.old.characterId).toBe('luna')
    expect((await chatSessionsRepo.getSession('old'))?.messages).toEqual(messages)
    expect(chats.sessionMetas.ambiguous.characterId).toBeNull()
    expect(chats.sessionMetas.group.characterId).toBeNull()
    expect(chats.index?.characters[UNBOUND_SESSION_GROUP].sessions.ambiguous.sessionId).toBe('ambiguous')
    expect(chats.sessionMessages.ambiguous).toEqual([])
    expect(requests.map(request => new URL(request.url).pathname)).toEqual(['/api/v1/contacts', '/api/v1/chats'])
    await chats.setActiveSession('ambiguous')
    expect(chats.activeSessionId).toBe('ambiguous')
    expect(cards.activeCardId).toBe('default')
  })

  it('purges a deleted contact history and outbox while retaining groups', async () => {
    const deleted = { ...contact('luna'), revision: 2, deletedAt: timestamp, document: null }
    const meta: ChatSessionMeta = { sessionId: 'doomed', userId: 'owner', characterId: 'luna', contactId: deleted.id, cloudChatId: 'doomed', conversationType: 'bot', createdAt: 1, updatedAt: 2 }
    await chatSessionsRepo.saveIndex({ userId: 'owner', characters: { luna: { activeSessionId: 'doomed', sessions: { doomed: meta } } } })
    await chatSessionsRepo.saveSession('doomed', { meta, messages: [{ id: 'old-message', role: 'user', content: 'Delete this text' }] })
    await chatSessionsRepo.enqueueOutbox('owner', { sessionId: 'doomed', messageId: 'late', role: 'assistant', content: 'Late text', attempts: 0, queuedAt: 1 })
    const { chats } = await context([contact('default'), deleted], [{ ...remote('group', null), type: 'group' }])
    await chats.synchronizeContacts()
    expect(chats.sessionMetas.doomed).toBeUndefined()
    expect(await chatSessionsRepo.getSession('doomed')).toBeNull()
    expect(await chatSessionsRepo.getOutbox('owner')).toEqual([])
    expect(chats.sessionMetas.group.conversationType).toBe('group')
    expect(chats.getSessionGenerationValue('doomed')).toBeGreaterThan(0)
  })
})
