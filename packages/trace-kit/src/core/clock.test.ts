import { describe, expect, it } from 'vitest'

import { ClockGraph, measureClockOffset } from './clock'

describe('clockGraph', () => {
  it('converts with the offset of one snapshot', () => {
    const graph = new ClockGraph('mono:collector')
    graph.addSnapshot([{ clock: 'mono:window', value: 100 }, { clock: 'mono:collector', value: 5100 }], 0.5)

    expect(graph.convert('mono:window', 250)?.value).toBe(5250)
  })

  it('fits drift over several snapshots', () => {
    const graph = new ClockGraph('mono:collector')
    // The window clock runs 100 ppm fast: 1000 ms of it is 999.9 ms of the collector.
    for (let index = 0; index < 5; index++)
      graph.addSnapshot([{ clock: 'mono:window', value: index * 60_000 }, { clock: 'mono:collector', value: 1000 + index * 60_000 * 0.9999 }], 0.1)

    const converted = graph.convert('mono:window', 600_000)!.value
    expect(converted).toBeCloseTo(1000 + 600_000 * 0.9999, 3)
  })

  it('converts through an intermediate clock', () => {
    const graph = new ClockGraph('mono:collector')
    graph.setUnitsPerMs('audio:capture:mic', 48)
    graph.addSnapshot([{ clock: 'audio:capture:mic', value: 0 }, { clock: 'mono:window', value: 2000 }], 1)
    graph.addSnapshot([{ clock: 'mono:window', value: 2000 }, { clock: 'mono:collector', value: 9000 }], 1)

    const converted = graph.convert('audio:capture:mic', 48_000)!
    expect(converted.value).toBe(10_000)
    expect(converted.estimated).toBe(true)
  })

  it('uses the samples after a discontinuity for later values', () => {
    const graph = new ClockGraph('mono:collector')
    graph.addSnapshot([{ clock: 'mono:window', value: 0 }, { clock: 'mono:collector', value: 1000 }], 0.1)
    graph.addSnapshot([{ clock: 'mono:window', value: 1000 }, { clock: 'mono:collector', value: 2000 }], 0.1)
    // The window slept. Its clock stopped for 30 s while the collector clock continued.
    graph.addDiscontinuity('mono:window')
    graph.addSnapshot([{ clock: 'mono:window', value: 2000 }, { clock: 'mono:collector', value: 33_000 }], 0.1)

    expect(graph.convert('mono:window', 500)!.value).toBeCloseTo(1500, 6)
    expect(graph.convert('mono:window', 2500)!.value).toBeCloseTo(33_500, 6)
  })

  it('returns undefined without a snapshot path', () => {
    const graph = new ClockGraph('mono:collector')

    expect(graph.convert('mono:window', 1)).toBeUndefined()
  })
})

describe('measureClockOffset', () => {
  it('keeps the sample with the smallest round trip', async () => {
    const times = [0, 10, 20, 22, 30, 50]
    let call = 0
    const remotes = [1005, 1021, 1040]

    const sample = await measureClockOffset({ now: () => times.shift()!, ping: async () => remotes[call++]!, count: 3 })

    expect(sample).toEqual({ local: 21, remote: 1021, uncertaintyMs: 1 })
  })
})
