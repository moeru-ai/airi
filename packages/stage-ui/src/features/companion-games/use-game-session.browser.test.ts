import type { MotionPort } from './motion-adapter'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, ref, shallowRef } from 'vue'

import { useGameSession } from './use-game-session'

const cleanups: (() => void)[] = []

function mountSession(port?: MotionPort) {
  const field = ref<HTMLElement | null>(null)
  const model = ref('first-model')
  const motionPort = shallowRef(port)
  let session!: ReturnType<typeof useGameSession>
  const app = createApp(defineComponent({
    setup() {
      session = useGameSession(field, model, motionPort)
      return () => h('div', { ref: field, style: { width: '640px', height: '360px', border: '2px solid' } })
    },
  }))
  const root = document.createElement('div')
  document.body.append(root)
  app.mount(root)
  const unmount = () => {
    app.unmount()
    root.remove()
  }
  cleanups.push(unmount)
  return { session, field, model, motionPort, unmount }
}

async function frames(count = 3) {
  for (let index = 0; index < count; index++)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
})

describe('game renderer lifecycle with real browser clocks', () => {
  it('advances live play, freezes pause, and rejects work after stop or unmount', async () => {
    const { session, unmount } = mountSession()
    session.start('catch-stars', { seed: 1 })
    await expect.poll(() => session.state.value.elapsed).toBeGreaterThan(0)
    session.pause()
    const paused = structuredClone(session.state.value)
    await frames()
    expect(session.state.value).toEqual(paused)
    session.act(host => host.resume())
    await expect.poll(() => session.state.value.elapsed).toBeGreaterThan(paused.elapsed)
    session.stop()
    const stopped = structuredClone(session.state.value)
    await frames()
    expect(session.state.value).toEqual(stopped)
    session.start('catch-stars', { seed: 2 })
    await expect.poll(() => session.state.value.elapsed).toBeGreaterThan(0)
    const beforeUnmount = structuredClone(session.state.value)
    unmount()
    cleanups.pop()
    await frames()
    expect(session.state.value).toEqual(beforeUnmount)
  })

  it('keeps unchanged initial geometry active and pauses a real resize', async () => {
    const { session, field } = mountSession()
    session.start('catch-stars', { seed: 1 })
    await frames()
    expect(session.state.value.status).toBe('playing')
    field.value!.style.width = '320px'
    await expect.poll(() => session.state.value.pauseReason).toBe('resize')
    const paused = structuredClone(session.state.value)
    await frames()
    expect(session.state.value).toEqual(paused)
  })

  it('leaves choice screens idle and isolates ten rapid restarts from a model switch', async () => {
    const { session, model } = mountSession()
    session.start('rock-paper-scissors', { seed: 1 })
    await frames()
    expect(session.state.value.elapsed).toBe(0)
    for (let index = 0; index < 10; index++)
      session.start('catch-stars', { seed: index })
    expect(session.state.value.sessionId).toBe(11)
    await expect.poll(() => session.state.value.elapsed).toBeGreaterThan(0)
    model.value = 'second-model'
    await expect.poll(() => session.state.value.status).toBe('idle')
    const stopped = structuredClone(session.state.value)
    await frames()
    expect(session.state.value).toEqual(stopped)
  })

  it('releases the old motion port before replacement and stops gestures on focus loss', async () => {
    const released = vi.fn()
    const playing = Promise.withResolvers<void>()
    let signal: AbortSignal | undefined
    const port: MotionPort = {
      sessionChanged: vi.fn(),
      acquire: () => ({
        signal: new AbortController().signal,
        play: (_intent, activeSignal) => {
          signal = activeSignal
          return playing.promise
        },
        release: released,
      }),
    }
    const { session, motionPort } = mountSession(port)
    session.start('copy-gesture', { seed: 1 })
    await expect.poll(() => signal !== undefined).toBe(true)
    const replacement: MotionPort = { sessionChanged: vi.fn(), acquire: vi.fn(() => undefined) }
    motionPort.value = replacement
    await expect.poll(() => released.mock.calls.length).toBe(1)
    expect(signal?.aborted).toBe(true)
    expect(session.state.value.pauseReason).toBe('ownership')
    playing.resolve()
    session.start('copy-gesture', { seed: 2 })
    await expect.poll(() => vi.mocked(replacement.acquire).mock.calls.length).toBe(1)
    window.dispatchEvent(new Event('blur'))
    expect(session.state.value.pauseReason).toBe('focus')
    const paused = structuredClone(session.state.value)
    await frames()
    expect(session.state.value).toEqual(paused)
  })
})
