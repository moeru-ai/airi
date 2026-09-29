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

function renderedExpressionValue(live2d: ReturnType<typeof createLive2D>) {
  let value = 0
  live2d.expressions.apply({
    getParameterValueById: () => value,
    setParameterValueById: (_, nextValue) => { value = nextValue },
  })
  return value
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

    await followerStore.startPreviewingExpression('avatar-iru', 'happy', 'settings-window')
    await followerStore.startPreviewingExpression('avatar-iru', 'happy', 'settings-window')

    await vi.waitFor(() => {
      expect(followerStore.expressionPreview).toMatchObject({
        ownerId: 'settings-window',
        avatarModelId: 'avatar-iru',
        names: ['happy'],
      })
    })
    expect(leaderStore.expressionPreview).toEqual(followerStore.expressionPreview)
    expect(leaderActions).toBe(2)
    expect(followerActions).toBe(0)
    expect(leaderMutations).toBe(1)

    await followerStore.stopPreviewingExpression('avatar-iru', 'happy', 'settings-window')
    await vi.waitFor(() => expect(followerStore.expressionPreview).toBeNull())
    expect(leaderStore.expressionPreview).toBeNull()

    await followerStore.startPreviewingExpression('avatar-iru', 'happy', 'settings-window')
    await followerStore.startPreviewingExpression('avatar-iru', 'sad', 'settings-window')
    await followerStore.stopPreviewingAllExpressions('avatar-iru', 'settings-window')
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

    await sharedLive2D.startPreviewingExpression('another-avatar', 'happy', 'settings-window')
    await nextTick()
    expect(renderedExpressionValue(live2d)).toBe(0)

    await sharedLive2D.startPreviewingExpression('avatar-iru', 'happy', 'settings-window')
    await nextTick()
    expect(renderedExpressionValue(live2d)).toBe(1)

    avatarModelId.value = 'another-avatar'
    await nextTick()
    expect(renderedExpressionValue(live2d)).toBe(0)

    avatarModelId.value = 'avatar-iru'
    await nextTick()
    expect(renderedExpressionValue(live2d)).toBe(1)

    await sharedLive2D.stopPreviewingExpression('avatar-iru', 'happy', 'settings-window')
    await nextTick()
    expect(renderedExpressionValue(live2d)).toBe(0)

    scope.stop()
    live2d.dispose()
    disposePinia(pinia)
  })

  // https://github.com/moeru-ai/airi/pull/2458#discussion_r4130100132
  // ROOT CAUSE:
  // A settings window can close before its final synchronized action reaches the Stage.
  // The owner lease then expires and releases the active expression.
  it('expires a preview when its settings window stops renewing the lease', async () => {
    vi.useFakeTimers()
    const pinia = createPinia()
    setActivePinia(pinia)
    const sharedLive2D = useSharedLive2D()
    const live2d = createLive2D()
    const scope = effectScope()

    try {
      live2d.beginModelLoad('display-model-iru')
      live2d.expressions.register(parseLive2DExpression('happy', 'happy.exp3.json', JSON.stringify({
        Parameters: [{ Id: 'ParamEyeSmile', Value: 1, Blend: 'Add' }],
      })))
      scope.run(() => useSharedLive2DExpressionPreview(live2d, 'avatar-iru'))

      await sharedLive2D.startPreviewingExpression('avatar-iru', 'happy', 'settings-window')
      await nextTick()
      expect(renderedExpressionValue(live2d)).toBe(1)

      await vi.advanceTimersByTimeAsync(10_000)
      await nextTick()
      expect(sharedLive2D.expressionPreview).toBeNull()
      expect(renderedExpressionValue(live2d)).toBe(0)
    }
    finally {
      scope.stop()
      live2d.dispose()
      disposePinia(pinia)
      vi.useRealTimers()
    }
  })

  it('keeps one settings window from clearing another window\'s preview', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const sharedLive2D = useSharedLive2D()

    await sharedLive2D.startPreviewingExpression('avatar-iru', 'happy', 'first-window')
    await sharedLive2D.startPreviewingExpression('avatar-iru', 'sad', 'second-window')
    await sharedLive2D.stopPreviewingAllExpressions('avatar-iru', 'first-window')
    expect(sharedLive2D.expressionPreview).toMatchObject({
      ownerId: 'second-window',
      names: ['sad'],
    })

    disposePinia(pinia)
  })

  it('keeps an ACT expression active under a preview and restores it after cleanup', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const sharedLive2D = useSharedLive2D()
    const live2d = createLive2D()
    const scope = effectScope()

    live2d.beginModelLoad('display-model-iru')
    live2d.expressions.register(parseLive2DExpression('happy', 'happy.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 1, Blend: 'Add' }],
    })))
    live2d.expressions.register(parseLive2DExpression('sad', 'sad.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: -1, Blend: 'Add' }],
    })))
    scope.run(() => useSharedLive2DExpressionPreview(live2d, 'avatar-iru'))

    await sharedLive2D.startPreviewingExpression('avatar-iru', 'happy', 'settings-window')
    await nextTick()
    expect(renderedExpressionValue(live2d)).toBe(1)
    expect(live2d.expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(0)

    live2d.expressions.reset()
    live2d.expressions.activate('sad')
    expect(live2d.expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(-1)
    expect(renderedExpressionValue(live2d)).toBe(1)

    await sharedLive2D.renewExpressionPreview('settings-window')
    await nextTick()
    expect(renderedExpressionValue(live2d)).toBe(1)

    await sharedLive2D.stopPreviewingExpression('avatar-iru', 'happy', 'settings-window')
    await nextTick()
    expect(renderedExpressionValue(live2d)).toBe(-1)
    expect(live2d.expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(-1)

    scope.stop()
    live2d.dispose()
    disposePinia(pinia)
  })

  // https://github.com/moeru-ai/airi/pull/2458#discussion_r3924569281
  // ROOT CAUSE:
  //
  // Removing one expression resets parameters shared with another preview.
  // Reapply the remaining previews after a removal.
  it('pr #2458 keeps a remaining preview active when expressions share a parameter', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const sharedLive2D = useSharedLive2D()
    const live2d = createLive2D()
    const scope = effectScope()

    live2d.beginModelLoad('display-model-iru')
    live2d.expressions.register(parseLive2DExpression('happy', 'happy.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 1, Blend: 'Add' }],
    })))
    live2d.expressions.register(parseLive2DExpression('excited', 'excited.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 2, Blend: 'Add' }],
    })))
    scope.run(() => useSharedLive2DExpressionPreview(live2d, 'avatar-iru'))

    await sharedLive2D.startPreviewingExpression('avatar-iru', 'happy', 'settings-window')
    await sharedLive2D.startPreviewingExpression('avatar-iru', 'excited', 'settings-window')
    await nextTick()
    expect(renderedExpressionValue(live2d)).toBe(2)

    await sharedLive2D.stopPreviewingExpression('avatar-iru', 'happy', 'settings-window')
    await nextTick()
    expect(renderedExpressionValue(live2d)).toBe(2)

    scope.stop()
    live2d.dispose()
    disposePinia(pinia)
  })
})
