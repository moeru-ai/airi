import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import { useVRMLipSync } from './lip-sync'

const lipSyncNode = vi.hoisted(() => ({
  disconnect: vi.fn(),
  volume: 1,
  weights: { A: 1 },
}))

vi.mock('@proj-airi/model-driver-lipsync/runtime/wlipsync', () => ({
  createWLipSyncNode: vi.fn(async () => lipSyncNode),
}))

describe('useVRMLipSync', () => {
  it('does not clear visemes when lip sync never owned the mouth', () => {
    const speechActive = shallowRef(false)
    const setValue = vi.fn()
    const scope = effectScope()
    const lipSync = scope.run(() => useVRMLipSync(shallowRef(undefined), shallowRef(undefined), speechActive))!
    // eslint-disable-next-line slop/no-chained-type-assertions
    const vrm = { expressionManager: { setValue } } as unknown as Parameters<typeof lipSync.update>[0]

    lipSync.update(vrm, 0.016)

    expect(setValue).not.toHaveBeenCalled()
    scope.stop()
  })

  it('zeroes visemes after lip sync owned the mouth and speech becomes inactive', async () => {
    const speechActive = shallowRef(true)
    const setValue = vi.fn()
    const scope = effectScope()
    const lipSync = scope.run(() => useVRMLipSync(shallowRef({} as AudioContext), shallowRef(undefined), speechActive))!
    // eslint-disable-next-line slop/no-chained-type-assertions
    const vrm = { expressionManager: { setValue } } as unknown as Parameters<typeof lipSync.update>[0]

    await vi.waitFor(() => {
      lipSync.update(vrm, 0.016)
      expect(setValue).toHaveBeenCalled()
    })
    setValue.mockClear()

    speechActive.value = false
    lipSync.update(vrm, 0.016)

    expect(setValue).toHaveBeenCalledWith('aa', 0)
    expect(setValue).toHaveBeenCalledWith('ou', 0)
    scope.stop()
  })

  it('connects its node to the played speech and moves it to a new connection', async () => {
    // ROOT CAUSE:
    //
    // The renderer received each played source node through a prop and kept only the newest one.
    // Overlapping streamed parts were missed, and the mouth read the audio before the clip fade.
    //
    // We fixed this by connecting the node once to the playback mix.
    const firstDisconnect = vi.fn()
    const secondDisconnect = vi.fn()
    const first = vi.fn(() => firstDisconnect)
    const second = vi.fn(() => secondDisconnect)
    const connectSpeech = shallowRef<(node: AudioNode) => () => void>(first)
    const scope = effectScope()
    scope.run(() => useVRMLipSync(shallowRef({} as AudioContext), connectSpeech, shallowRef(true)))

    await vi.waitFor(() => expect(first).toHaveBeenCalledWith(lipSyncNode))

    connectSpeech.value = second
    await nextTick()
    expect(firstDisconnect).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledWith(lipSyncNode)

    scope.stop()
    expect(secondDisconnect).toHaveBeenCalledOnce()
  })
})
