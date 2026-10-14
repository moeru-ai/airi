import type { DecodedClip } from './events'

import { describe, expect, it } from 'vitest'

import { DecoderPool } from './decoder-pool'

/** A decoder whose decodes finish only when the test resolves them. */
function heldDecoder() {
  const pending: { length: number, resolve: (decoded: DecodedClip) => void }[] = []
  return {
    pending,
    decode: (samples: Float32Array) => new Promise<DecodedClip>((resolve) => {
      pending.push({ length: samples.length, resolve })
    }),
    dispose: () => {},
  }
}

const options = { sampleRate: 16000, blankPenalty: 0 }
const emptyClip: DecodedClip = { segments: [], rollouts: [] }

describe('decoderPool', () => {
  it('runs one decode per decoder and starts waiting decodes in call order', async () => {
    const first = heldDecoder()
    const second = heldDecoder()
    const pool = new DecoderPool([first, second])

    const results = [1, 2, 3, 4].map(length => pool.decode(new Float32Array(length), options))
    await Promise.resolve()

    expect([...first.pending, ...second.pending].map(job => job.length).toSorted()).toEqual([1, 2])
    const busy = first.pending[0]?.length === 1 ? first : second
    busy.pending.shift()!.resolve(emptyClip)
    await results[0]
    await Promise.resolve()
    // The freed decoder takes the oldest waiting decode.
    expect(busy.pending.map(job => job.length)).toEqual([3])
  })

  it('removes a waiting decode when its signal aborts', async () => {
    const only = heldDecoder()
    const pool = new DecoderPool([only])
    const controller = new AbortController()

    const running = pool.decode(new Float32Array(1), options)
    const waiting = pool.decode(new Float32Array(2), options, controller.signal)
    const after = pool.decode(new Float32Array(3), options)
    controller.abort(new Error('stopped'))

    await expect(waiting).rejects.toThrow('stopped')
    only.pending.shift()!.resolve(emptyClip)
    await running
    await Promise.resolve()
    expect(only.pending.map(job => job.length)).toEqual([3])
    only.pending.shift()!.resolve(emptyClip)
    await after
  })
})
