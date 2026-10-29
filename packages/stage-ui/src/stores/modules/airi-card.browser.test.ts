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

describe('issue #3124 restores the active Character after a restart', () => {
  const activeCardIdKey = 'airi-card-active-id'
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
    const cardStore = useAiriCardStore()
    await cardStore.initialize()
    // The card map writes to `localStorage` in a watcher. Let it flush before the next launch.
    await nextTick()
    return cardStore
  }

  // https://github.com/moeru-ai/airi/issues/3124
  // ROOT CAUSE:
  //
  // The store started the selection from a constant, so every launch picked the
  // built-in Character. Nothing read or wrote the key.
  //
  //   const activeCardId = shallowRef('default')
  //
  // We fixed this by reading the key when the store is created, and writing it in
  // the actions that change the selection.
  it('issue #3124 restores the Character that was active before the restart', async () => {
    const firstRun = await launch()
    const cardId = await firstRun.addCard({ name: 'Second Character', version: '1.0.0', description: 'The selected Character.' }, 'scratch')
    await firstRun.activateCard(cardId)

    expect(localStorage.getItem(activeCardIdKey)).toBe(cardId)

    const secondRun = await launch()

    expect(secondRun.activeCardId).toBe(cardId)
    expect(secondRun.activeCard?.name).toBe('Second Character')
  })

  it('starts from the built-in Character when nothing is stored', async () => {
    const cardStore = await launch()

    expect(cardStore.activeCardId).toBe('default')
    expect(localStorage.getItem(activeCardIdKey)).toBe('default')
  })

  it('falls back to the built-in Character when the stored selection is gone', async () => {
    localStorage.setItem(activeCardIdKey, 'deleted-card')

    const cardStore = await launch()

    expect(cardStore.activeCardId).toBe('default')
    expect(localStorage.getItem(activeCardIdKey)).toBe('default')
  })

  it('records the built-in Character after the active card is deleted', async () => {
    const firstRun = await launch()
    const cardId = await firstRun.addCard({ name: 'Temporary', version: '1.0.0', description: 'Removed again.' }, 'scratch')
    await firstRun.activateCard(cardId)

    await firstRun.removeCard(cardId)

    expect(localStorage.getItem(activeCardIdKey)).toBe('default')

    const secondRun = await launch()

    expect(secondRun.activeCardId).toBe('default')
  })

  it('forgets the selection when all data is reset', async () => {
    const cardStore = await launch()
    const cardId = await cardStore.addCard({ name: 'Reset me', version: '1.0.0' }, 'scratch')
    await cardStore.activateCard(cardId)
    expect(localStorage.getItem(activeCardIdKey)).toBe(cardId)

    cardStore.resetState()

    expect(localStorage.getItem(activeCardIdKey)).toBeNull()
  })
})

// ROOT CAUSE:
//
// `initialize()` looked up the module stores after an `await`, through the active Pinia.
// A stray action of a disposed Pinia could make that one active, so CI failed with `Pinia destroyed`.
//
// We fixed this by passing the card store's own Pinia to these lookups.
describe('airi card store keeps to its own Pinia', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('initializes while another Pinia becomes active', async () => {
    const stale = createPinia()
    createApp({}).use(stale)
    disposePinia(stale)

    const pinia = createPinia()
    // Stands in for that stray action: every action of this Pinia hands the active Pinia back to the stale one.
    pinia.use(({ store }) => {
      store.$onAction(({ after, onError }) => {
        after(() => setActivePinia(stale))
        onError(() => setActivePinia(stale))
      })
    })
    createApp({}).use(pinia).use(PiniaColada)
    setActivePinia(pinia)
    const cardStore = useAiriCardStore()
    const initialized = cardStore.initialize()
    setActivePinia(stale)

    await expect(initialized).resolves.toBeUndefined()
    expect(cardStore.cards.has('default')).toBe(true)
    disposePinia(pinia)
  })
})
