import type { LeadershipMode } from 'pinia-plugin-synced'

import en from '@proj-airi/i18n/locales/en'

import { BrowserPlayback } from '@proj-airi/audio/browser'
import { toWavFromPCM16 } from '@proj-airi/audio/encoding'
import { VoiceController } from '@proj-airi/core-agent'
import { Playback } from '@proj-airi/pipelines-audio'
import { MotionPlugin } from '@vueuse/motion'
import { generateSpeech } from '@xsai/generate-speech'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import SpeechSettings from '../../../../stage-pages/src/pages/settings/modules/speech.vue'

import { trackPendingActions } from '../../libs/pinia/pending-actions'
import { injectKeyPiniaSynced } from '../../libs/pinia/synced-context'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useAiriCardStore } from './airi-card'
import { useSpeechStore } from './speech'

const definitionId = 'openrouter-audio-speech'
const providerId = 'custom-openrouter'
const fishModel = 'fish-audio/s2.1-pro-free:free'
const config = { apiKey: 'test-key', baseUrl: 'https://speech.example.com/v1/' }
const cleanups = new Set<() => Promise<void>>()
const nativeFetch = globalThis.fetch

/** Mounts real stores and the optional settings page in an isolated renderer. */
function mountRenderer(namespace: string, leadership: LeadershipMode, settings = false) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership })
  pinia.use(runtime.plugin)
  const pending = trackPendingActions(pinia)
  let pendingRPCs = 0
  // Synced wrappers bypass the caller's $onAction hooks. Track their real returned promises after the runtime installs them.
  pinia.use(({ options, store }) => {
    const synced = options.synced
    if (!synced || synced === true || !synced.actions)
      return
    const actions = Array.isArray(synced.actions) ? synced.actions : Object.keys(synced.actions)
    for (const name of actions) {
      const action = store[name]
      store[name] = async (...args: unknown[]) => {
        pendingRPCs++
        try {
          return await action.apply(store, args)
        }
        finally {
          pendingRPCs--
        }
      }
    }
  })
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp({
    setup() {
      useSpeechStore()
      useAiriCardStore()
      return () => settings ? h(SpeechSettings) : null
    },
  })
  app.provide(injectKeyPiniaSynced, runtime)
    .use(pinia)
    .use(createRouter({ history: createMemoryHistory(), routes: [] }))
    .use(MotionPlugin)
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .mount(container)
  const drain = () => vi.waitFor(async () => {
    // A reply can wake store watchers. Let their Vue jobs enqueue the next action before checking both counters.
    await nextTick()
    expect(pending()).toBe(0)
    expect(pendingRPCs).toBe(0)
  })
  const dispose = async () => {
    // Stop component producers first. Keep the leader and both transports alive through unmount and store cleanup work.
    app.unmount()
    await drain()
    disposePinia(pinia)
    await drain()
    runtime.dispose()
    container.remove()
    cleanups.delete(dispose)
  }
  cleanups.add(dispose)
  return { app, container, runtime, dispose, cards: useAiriCardStore(pinia), speech: useSpeechStore(pinia), providers: useProviderStore(pinia), config: useProviderConfigStore(pinia) }
}

function speechModel(id: string) {
  return { id, architecture: { output_modalities: ['speech'] }, endpoints: ['/api/v1/audio/speech'], supported_voices: null }
}

function mockOpenRouter(models: () => ReturnType<typeof speechModel>[]) {
  const synthesis = vi.fn<typeof fetch>(async () => new Response(toWavFromPCM16(new Uint8Array(4800), 24000), {
    headers: { 'Content-Type': 'audio/wav' },
  }))
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href)
    if (url.protocol === 'data:' || url.pathname.endsWith('.wasm'))
      return nativeFetch(input, init)
    if (url.origin !== 'https://speech.example.com')
      return Response.json({ data: [], voices: [], models: [] })
    if (url.pathname.endsWith('/models'))
      return Response.json({ data: url.searchParams.has('output_modalities') ? models() : [] })
    return synthesis(input, init)
  }))
  return synthesis
}

afterEach(async () => {
  for (const dispose of [...cleanups].reverse())
    await dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

// https://github.com/moeru-ai/airi/issues/3456
// ROOT CAUSE:
// Only the custom voice ID survived restart. The leader now restores its runtime object after a matching empty catalog arrives.
it('restores an Issue #3456 custom Fish voice after settings and stores restart', async () => {
  localStorage.clear()
  const synthesis = mockOpenRouter(() => [speechModel(fishModel)])
  const namespace = `openrouter:${crypto.randomUUID()}`
  const leader = mountRenderer(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  await leader.config.ensureProvider(providerId, definitionId, config)
  await leader.providers.forceProviderConfigured(providerId)
  await leader.speech.selectProviderModel(providerId, fishModel)
  const follower = mountRenderer(namespace, 'follower-only', true)
  const view = page.elementLocator(follower.container)
  const input = view.getByRole('textbox', { name: /Voice Name/ })
  await expect.element(input).toBeVisible()
  await expect.element(view.getByRole('button', { name: 'Test Voice', exact: true })).toBeDisabled()
  await input.fill('custom-fish-voice')
  await vi.waitFor(() => expect(leader.speech.activeSpeechVoiceId).toBe('custom-fish-voice'))
  await vi.waitFor(() => expect(localStorage.getItem('settings/speech/voice')).toBe('custom-fish-voice'))
  await view.getByRole('button', { name: 'Test Voice', exact: true }).click()
  await vi.waitFor(() => expect(synthesis).toHaveBeenCalledOnce(), { timeout: 10_000 })
  await follower.dispose()
  await leader.dispose()

  // A new namespace and Pinia pair can restore only durable settings, not the old runtime voice object.
  const restartedNamespace = `openrouter:${crypto.randomUUID()}`
  const restarted = mountRenderer(restartedNamespace, 'leader-only')
  await vi.waitFor(() => expect(restarted.runtime.isLeader()).toBe(true))
  const settings = mountRenderer(restartedNamespace, 'follower-only', true)
  await vi.waitFor(() => expect(settings.speech.activeSpeechVoiceId).toBe('custom-fish-voice'))
  await vi.waitFor(() => expect(settings.speech.availableVoices[providerId]).toEqual([]))
  const restoredView = page.elementLocator(settings.container)
  await expect.element(restoredView.getByRole('textbox', { name: /Voice Name/ })).toHaveValue('custom-fish-voice')
  const preview = restoredView.getByRole('button', { name: 'Test Voice', exact: true })
  await expect.element(preview).toBeEnabled()
  expect(settings.speech.activeSpeechVoice?.id).toBe('custom-fish-voice')
  expect(settings.speech.activeSpeechVoice?.provider).toBe(providerId)
  await preview.click()
  await vi.waitFor(() => expect(synthesis).toHaveBeenCalledTimes(2), { timeout: 10_000 })

  const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
  await settings.speech.ensureActiveSpeechVoice()
  await settings.speech.ensureActiveSpeechVoice()
  expect(traffic).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'onCall', rest: expect.arrayContaining(['replaceState']) }))

  const context = new AudioContext()
  const playback = new Playback(new BrowserPlayback(context))
  const turn = { sessionId: 'test-session', turnId: 'test-turn' }
  const controller = new VoiceController({
    speech: () => restarted.speech.createOutput(turn, {
      provider: restarted.speech.activeSpeechProvider,
      model: restarted.speech.activeSpeechModel,
      voice_id: restarted.speech.activeSpeechVoiceId,
    }, { playback }, context),
  })
  try {
    await context.resume()
    const response = controller.openResponse(turn)
    const speech = response.openSpeech({ purpose: 'answer' })
    await speech.write('Hello after restart.')
    speech.end()
    expect(await response.finish()).toBe('finished')
    expect(synthesis).toHaveBeenCalledTimes(3)
    for (const [input, init] of synthesis.mock.calls) {
      expect(String(input)).toBe(`${config.baseUrl}audio/speech`)
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: fishModel, voice: 'custom-fish-voice' })
    }
  }
  finally {
    await controller.close()
    await context.close()
  }
}, 30000)

// https://github.com/moeru-ai/airi/issues/3456
// ROOT CAUSE:
// Dropdown discovery uses temporary instances. The cached synthesis instance now refreshes when it cannot resolve the selected model.
it('synthesizes an Issue #3456 refreshed dropdown model through the real cached provider store instance', async () => {
  localStorage.clear()
  let models = [speechModel('minimax/speech-2.8-hd')]
  const synthesis = mockOpenRouter(() => models)
  const renderer = mountRenderer(`openrouter:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(renderer.runtime.isLeader()).toBe(true))
  await renderer.config.ensureProvider(providerId, definitionId, config)
  await renderer.providers.forceProviderConfigured(providerId)
  const cached = await renderer.providers.getProviderInstance(providerId)
  if (!('speech' in cached))
    throw new Error('Provider has no speech method')
  await generateSpeech({ ...cached.speech(models[0]!.id), input: 'Hello.', voice: 'test-voice' })

  models = [...models, speechModel(fishModel)]
  await renderer.providers.fetchModelsForProvider(providerId)
  expect(renderer.providers.getModelsForProvider(providerId).map(model => model.id)).toContain(fishModel)
  const selected = await renderer.providers.getProviderInstance(providerId)
  expect(selected).toBe(cached)
  if (!('speech' in selected))
    throw new Error('Provider has no speech method')
  await generateSpeech({ ...selected.speech(fishModel), input: 'Hello.', voice: 'custom-fish-voice' })
  expect(JSON.parse(String(synthesis.mock.lastCall?.[1]?.body)).model).toBe(fishModel)
}, 30000)

// https://github.com/moeru-ai/airi/issues/3456
// ROOT CAUSE:
// The follower's action hooks cannot see an RPC waiting for its reply. Unmount can also queue work after the initial drain.
// Teardown must keep synchronization alive until these caller promises settle.
it.each(['unmount', 'next tick'])('drains an Issue #3456 voice persistence RPC queued during %s before closing its follower', async (timing) => {
  mockOpenRouter(() => [speechModel(fishModel)])
  const namespace = `openrouter:${crypto.randomUUID()}`
  const leader = mountRenderer(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const follower = mountRenderer(namespace, 'follower-only')
  await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))

  const postMessage = BroadcastChannel.prototype.postMessage
  let callNumber: number | undefined
  let releaseReply: (() => void) | undefined
  // Delay only the real card action's transport reply. The leader still executes and commits the original action.
  const transport = vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, message) {
    if (message.name === 'onCall' && message.rest[0] === follower.runtime.participantId
      && message.rest[2] === 'invokeAction' && message.rest[3].storeId === 'airi-card'
      && message.rest[3].actionName === 'updateActiveCardSpeech') {
      callNumber = message.rest[1]
    }
    if (message.name === 'onReturn' && message.to === follower.runtime.participantId && message.rest[0] === callNumber) {
      releaseReply = () => postMessage.call(this, message)
      return
    }
    postMessage.call(this, message)
  })
  const disposeRuntime = vi.spyOn(follower.runtime, 'dispose')
  const persistence = Promise.withResolvers<boolean>()
  follower.app.onUnmount(async () => {
    if (timing === 'next tick')
      await nextTick()
    persistence.resolve(follower.cards.updateActiveCardSpeech({ provider: providerId, model: fishModel, voice_id: 'custom-fish-voice' }))
  })
  const closing = follower.dispose()
  // Observe both outcomes immediately. A rejected RPC must fail the assertions, including under the broken teardown.
  const outcomes = Promise.allSettled([closing, persistence.promise])
  try {
    await vi.waitFor(() => expect(releaseReply).toBeTypeOf('function'))
    expect(disposeRuntime).not.toHaveBeenCalled()
  }
  finally {
    releaseReply?.()
    transport.mockRestore()
    expect(await outcomes).toEqual([
      { status: 'fulfilled', value: undefined },
      { status: 'fulfilled', value: false },
    ])
  }
}, 30000)
