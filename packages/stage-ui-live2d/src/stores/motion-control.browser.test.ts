import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'

import { defaultLive2DMotionControlDynamics, neutralLive2DMotionControlPose, useLive2DMotionControl } from './motion-control'

/** One store for each Pinia, like one store for each renderer window. Both open the same BroadcastChannel. */
function createWindowStore() {
  setActivePinia(createPinia())
  return useLive2DMotionControl()
}

describe('motion control delivery', () => {
  it('keeps a local pose inside its own window and broadcasts the others', async () => {
    // ROOT CAUSE:
    //
    // Only the web Stage ran MAGIC, so the settings route had no driver. With a
    // driver in each renderer, two windows that broadcast one owner replace each
    // other's pose.
    //
    // We fixed this with a local delivery.
    const sender = createWindowStore()
    const receiver = createWindowStore()
    const receivedOwners: (string | null)[] = []
    watch(() => receiver.control.ownerId, owner => receivedOwners.push(owner), { flush: 'sync' })
    const pose = { ...neutralLive2DMotionControlPose, headX: 0.5 }

    sender.setPose('magic', pose, defaultLive2DMotionControlDynamics, { broadcast: false })
    sender.release('magic', { broadcast: false })
    // BroadcastChannel keeps the order of one sender, so the local pose would arrive before this one.
    sender.setPose('devtools', pose, defaultLive2DMotionControlDynamics)

    expect(sender.control.ownerId).toBe('devtools')
    await vi.waitFor(() => expect(receiver.control.ownerId).toBe('devtools'))
    expect(receivedOwners).toEqual(['devtools'])
  })
})
