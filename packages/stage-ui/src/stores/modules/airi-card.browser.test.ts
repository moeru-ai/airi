import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { AiriCard } from './airi-card'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import { useSettingsStageModel } from '../settings/stage-model'
import { useAiriCardStore } from './airi-card'

const syncedContexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia).use(PiniaColada)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('airi card Live2D control synchronization', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ voices: [], recommended: {}, data: [] })))
  })

  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('routes a follower policy update through the leader once', async () => {
    const namespace = `airi-card-controls:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderStore = useAiriCardStore()
    await leaderStore.initialize()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useAiriCardStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => expect(followerStore.cards.has('default')).toBe(true))

    let leaderActions = 0
    let followerActions = 0
    leaderStore.$onAction(({ name }) => {
      if (name === 'updateLive2DControlPolicy')
        leaderActions += 1
    })
    followerStore.$onAction(({ name }) => {
      if (name === 'updateLive2DControlPolicy')
        followerActions += 1
    })

    const policy = {
      disabledExpressions: ['sad'],
      disabledMotions: ['idle.motion3.json'],
    }
    await followerStore.updateLive2DControlPolicy('default', 'default-live2d-avatar-model', policy)

    await vi.waitFor(() => {
      expect(followerStore.selectedAvatarModel?.type).toBe('live2d')
      if (followerStore.selectedAvatarModel?.type === 'live2d')
        expect(followerStore.selectedAvatarModel.config.controls).toEqual(policy)
    })

    expect(leaderStore.selectedAvatarModel?.type).toBe('live2d')
    if (leaderStore.selectedAvatarModel?.type === 'live2d')
      expect(leaderStore.selectedAvatarModel.config.controls).toEqual(policy)
    expect(leaderActions).toBe(1)
    expect(followerActions).toBe(0)
  })
})

// https://github.com/moeru-ai/airi/pull/2458
// ROOT CAUSE:
//
// Up to v0.12.0-beta.5 the Stage model was also stored in `settings/stage/model`.
// PR #2458 stopped reading it, so an upgrade showed the bundled preset.
//
// We fixed this by moving the key once into the active card, only while that
// card shows the bundled preset.
describe('pr #2458 migrates the global Stage model of v0.12.0-beta.5 and earlier', () => {
  const legacyStageModelKey = 'settings/stage/model'
  const pinias: Array<ReturnType<typeof createPinia>> = []

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    for (const pinia of pinias.splice(0))
      disposePinia(pinia)
    localStorage.clear()
  })

  /** Starts the app again on the cards and keys that `localStorage` holds. */
  async function launch() {
    const pinia = createPinia()
    createApp({}).use(pinia).use(PiniaColada)
    pinias.push(pinia)
    setActivePinia(pinia)
    const stageModelStore = useSettingsStageModel()
    const cardStore = useAiriCardStore()
    await cardStore.initialize()
    // The card map writes to `localStorage` in a watcher. Let it flush before the next launch.
    await nextTick()
    return { cardStore, stageModelStore }
  }

  function defaultDisplayModelId(card: AiriCard | undefined) {
    const extension = card?.extensions.airi
    return extension?.avatarModels.find(model => model.id === extension.defaultAvatarModelId)?.displayModelId
  }

  it('moves the global Stage model into a card that shows the bundled preset', async () => {
    await launch()
    localStorage.setItem(legacyStageModelKey, 'preset-vrm-2')

    const { cardStore, stageModelStore } = await launch()

    expect(defaultDisplayModelId(cardStore.cards.get('default'))).toBe('preset-vrm-2')
    expect(stageModelStore.stageModelSelected).toBe('preset-vrm-2')
    expect(localStorage.getItem(legacyStageModelKey)).toBeNull()
  })

  it('keeps a model chosen on the card over a stale global Stage model', async () => {
    const { cardStore: firstRun } = await launch()
    await firstRun.setActiveCardDefaultAvatarModel('preset-vrm-1')
    await nextTick()
    localStorage.setItem(legacyStageModelKey, 'preset-vrm-2')

    const { cardStore, stageModelStore } = await launch()

    expect(defaultDisplayModelId(cardStore.cards.get('default'))).toBe('preset-vrm-1')
    expect(stageModelStore.stageModelSelected).toBe('preset-vrm-1')
    expect(localStorage.getItem(legacyStageModelKey)).toBeNull()
  })

  it('leaves the cards unchanged without a global Stage model', async () => {
    await launch()
    const storedCards = localStorage.getItem('airi-cards')

    const { cardStore, stageModelStore } = await launch()

    expect(defaultDisplayModelId(cardStore.cards.get('default'))).toBe('preset-live2d-1')
    expect(stageModelStore.stageModelSelected).toBe('preset-live2d-1')
    expect(localStorage.getItem('airi-cards')).toBe(storedCards)
  })

  it('moves the global Stage model only once', async () => {
    await launch()
    localStorage.setItem(legacyStageModelKey, 'preset-vrm-2')
    const { cardStore: migrated } = await launch()
    // The user selects the bundled preset again after the migration.
    await migrated.setActiveCardDefaultAvatarModel('preset-live2d-1')
    await nextTick()

    const { cardStore, stageModelStore } = await launch()

    expect(defaultDisplayModelId(cardStore.cards.get('default'))).toBe('preset-live2d-1')
    expect(stageModelStore.stageModelSelected).toBe('preset-live2d-1')
  })
})
