import type { LeadershipMode } from 'pinia-plugin-synced'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { injectKeyPiniaSynced } from '../libs/pinia/synced-context'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useConsciousnessSettingsStore } from '../stores/modules/consciousness-settings'
import { useDiscordStore } from '../stores/modules/discord'
import { useFactorioStore } from '../stores/modules/gaming-factorio'
import { useMinecraftStore } from '../stores/modules/gaming-minecraft'
import { useHearingStore } from '../stores/modules/hearing'
import { useSpeechStore } from '../stores/modules/speech'
import { useTwitterStore } from '../stores/modules/twitter'
import { useWebSearchStore } from '../stores/modules/web-search'
import { useDataMaintenance } from './use-data-maintenance'

const cleanups: Array<() => void> = []

/** Mounts the maintenance composable with real stores and a separate synchronization runtime. */
function mountMaintenance(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership })
  pinia.use(runtime.plugin)
  let maintenance: ReturnType<typeof useDataMaintenance> | undefined
  const app = createApp({
    setup() {
      maintenance = useDataMaintenance()
      return () => null
    },
  })
  app.provide(injectKeyPiniaSynced, runtime)
    .use(pinia)
    .use(PiniaColada)
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .mount(document.createElement('div'))
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
    runtime.dispose()
  })
  if (!maintenance)
    throw new Error('Maintenance composable did not initialize')
  return { pinia, runtime, maintenance }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0))
    cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

// https://github.com/moeru-ai/airi/pull/2490#discussion_r3968502055
// ROOT CAUSE: Sequential awaits stopped independent module cleanup after one
// leader RPC failed. Every reset must settle before the caller receives the error.
it.each(['resetSettings', 'resetState'])('continues independent module resets when the %s RPC fails', async (action) => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  const namespace = `maintenance:${crypto.randomUUID()}`
  const leader = mountMaintenance(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const follower = mountMaintenance(namespace, 'follower-only')
  await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
  const { pinia } = follower
  await useConsciousnessSettingsStore(pinia).setReasoning(true)
  useMinecraftStore(pinia).latestRuntimeContextText = 'previous context'
  const modules = [
    useHearingStore(pinia),
    useSpeechStore(pinia),
    useConsciousnessStore(pinia),
    useTwitterStore(pinia),
    useWebSearchStore(pinia),
    useDiscordStore(pinia),
    useFactorioStore(pinia),
    useMinecraftStore(pinia),
  ]
  const resetModules: string[] = []
  for (const module of modules) {
    module.$onAction(({ name }) => {
      if (name === 'resetState')
        resetModules.push(module.$id)
    })
  }
  const postMessage = BroadcastChannel.prototype.postMessage
  vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, message) {
    if (JSON.stringify(message).includes(`"${action}"`))
      throw new Error('Reset transport unavailable')
    postMessage.call(this, message)
  })
  await expect(follower.maintenance.resetModulesSettings()).rejects.toThrow('Reset transport unavailable')
  expect(resetModules).toEqual(modules.map(module => module.$id))
  expect(useMinecraftStore(pinia).latestRuntimeContextText).toBe('')
  expect(useConsciousnessSettingsStore(leader.pinia).reasoning).toBe(action === 'resetState')
})
