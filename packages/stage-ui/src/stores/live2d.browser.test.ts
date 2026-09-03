import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { parseLive2DExpression } from '@proj-airi/stage-ui-live2d/contexts/expressions'
import { createLive2D } from '@proj-airi/stage-ui-live2d/contexts/live2d'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, nextTick, shallowRef } from 'vue'

import { useSharedLive2D, useSharedLive2DExpressionPreview } from './live2d'

const syncedContexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('shared Live2D expression previews', () => {
  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
  })

  it('routes preview changes through the leader and replicates their state', async () => {
    const namespace = `shared-live2d:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderStore = useSharedLive2D()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useSharedLive2D()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    let leaderActions = 0
    let followerActions = 0
    let leaderMutations = 0
    leaderStore.$onAction(({ name }) => {
      if (name === 'startPreviewingExpression')
        leaderActions += 1
    })
    leaderStore.$subscribe(() => leaderMutations += 1, { flush: 'sync' })
    followerStore.$onAction(({ name }) => {
      if (name === 'startPreviewingExpression')
        followerActions += 1
    })

    await followerStore.startPreviewingExpression('avatar-iru', 'happy')
    await followerStore.startPreviewingExpression('avatar-iru', 'happy')

    await vi.waitFor(() => {
      expect(followerStore.expressionPreview).toEqual({
        avatarModelId: 'avatar-iru',
        names: ['happy'],
      })
    })
    expect(leaderStore.expressionPreview).toEqual(followerStore.expressionPreview)
    expect(leaderActions).toBe(2)
    expect(followerActions).toBe(0)
    expect(leaderMutations).toBe(1)

    await followerStore.stopPreviewingExpression('avatar-iru', 'happy')
    await vi.waitFor(() => expect(followerStore.expressionPreview).toBeNull())
    expect(leaderStore.expressionPreview).toBeNull()

    await followerStore.startPreviewingExpression('avatar-iru', 'happy')
    await followerStore.startPreviewingExpression('avatar-iru', 'sad')
    await followerStore.stopPreviewingAllExpressions('avatar-iru')
    await vi.waitFor(() => expect(followerStore.expressionPreview).toBeNull())
    expect(leaderStore.expressionPreview).toBeNull()
    expect(localStorage.getItem('shared-live2d')).toBeNull()
  })

  it('applies synchronized previews only to the matching Avatar Model', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const sharedLive2D = useSharedLive2D()
    const live2d = createLive2D()
    const avatarModelId = shallowRef('avatar-iru')
    const scope = effectScope()

    live2d.beginModelLoad('display-model-iru')
    live2d.expressions.register(parseLive2DExpression('happy', 'happy.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 1, Blend: 'Add' }],
    })))
    scope.run(() => useSharedLive2DExpressionPreview(live2d, avatarModelId))

    await sharedLive2D.startPreviewingExpression('another-avatar', 'happy')
    await nextTick()
    expect(live2d.expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(0)

    await sharedLive2D.startPreviewingExpression('avatar-iru', 'happy')
    await nextTick()
    expect(live2d.expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(1)

    avatarModelId.value = 'another-avatar'
    await nextTick()
    expect(live2d.expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(0)

    avatarModelId.value = 'avatar-iru'
    await nextTick()
    expect(live2d.expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(1)

    await sharedLive2D.stopPreviewingExpression('avatar-iru', 'happy')
    await nextTick()
    expect(live2d.expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(0)

    scope.stop()
    live2d.dispose()
    disposePinia(pinia)
  })
})
