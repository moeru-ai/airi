import { afterEach, describe, expect, it, vi } from 'vitest'

import { SharedWantedTracks } from './use-trace'

const channels: BroadcastChannel[] = []

afterEach(() => {
  channels.splice(0).forEach(channel => channel.close())
})

/** A tab with its own channel instance, as each page of the origin has. */
function tab(name: string) {
  const channel = new BroadcastChannel('airi-trace-test')
  channels.push(channel)
  const applied: (ReadonlySet<string> | '*')[] = []
  const wanted = new SharedWantedTracks(name, channel, tracks => applied.push(tracks))
  channel.addEventListener('message', event => wanted.receive(event.data, performance.now()))
  return { wanted, applied, last: () => applied.at(-1) }
}

describe('shared wanted tracks', () => {
  it('lets a producer tab want the tracks of a viewer in another tab, until the viewer leaves', async () => {
    const stage = tab('stage')
    const tracer = tab('tracer')

    tracer.wanted.setOwn(new Set(['participants/agent/playback']))
    await vi.waitFor(() => expect(stage.last()).toEqual(new Set(['participants/agent/playback'])))

    tracer.wanted.leave()
    await vi.waitFor(() => expect(stage.last()).toEqual(new Set()))
  })

  it('answers a new tab with the tracks that its viewers already want', async () => {
    const tracer = tab('tracer')
    tracer.wanted.setOwn('*')

    const stage = tab('stage')
    await vi.waitFor(() => expect(stage.last()).toBe('*'))
  })

  it('drops a tab that stops repeating its tracks', async () => {
    const stage = tab('stage')
    const tracer = tab('tracer')
    tracer.wanted.setOwn(new Set(['participants/user/input']))
    await vi.waitFor(() => expect(stage.last()).toEqual(new Set(['participants/user/input'])))

    stage.wanted.tick(performance.now() + 60_000, 1000)
    expect(stage.last()).toEqual(new Set())
  })
})
