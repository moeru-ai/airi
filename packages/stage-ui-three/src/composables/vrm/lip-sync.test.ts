import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import { useVRMLipSync } from './lip-sync'

const lipSyncNode = vi.hoisted(() => ({ disconnect: vi.fn() }))

vi.mock('@proj-airi/model-driver-lipsync/runtime/wlipsync', () => ({
  createWLipSyncNode: vi.fn(async () => lipSyncNode),
}))

describe('useVRMLipSync', () => {
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
    scope.run(() => useVRMLipSync(shallowRef({} as AudioContext), connectSpeech))

    await vi.waitFor(() => expect(first).toHaveBeenCalledWith(lipSyncNode))

    connectSpeech.value = second
    await nextTick()
    expect(firstDisconnect).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledWith(lipSyncNode)

    scope.stop()
    expect(secondDisconnect).toHaveBeenCalledOnce()
  })
})
