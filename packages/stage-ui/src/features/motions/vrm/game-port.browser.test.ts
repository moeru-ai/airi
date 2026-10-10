import type { MotionIntent } from '../../companion-games/motion-adapter'
import type { GameMotionRequest, GameMotionResult } from './game-protocol'

import { createContext } from '@moeru/eventa/adapters/broadcast-channel'
import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'

import * as v from 'valibot'

import { createGameMotionPort } from './game-port'
import { gameMotionRequest, gameMotionRequestSchema, gameMotionResult, gameMotionRevoked } from './game-protocol'

const cleanups: (() => void)[] = []
const intent: MotionIntent = { sessionId: 1, revision: 1, name: 'wave' }

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse())
    cleanup()
})

function setup(automaticReserve = true, automaticHeartbeat = true) {
  const selectedModel = ref(`avatar-${crypto.randomUUID()}`)
  const modelId = selectedModel.value
  const instanceId = crypto.randomUUID()
  const channel = new BroadcastChannel('proj-airi:vrm-motions')
  const remote = createContext(channel)
  const requests: GameMotionRequest[] = []
  const respond = (request: GameMotionRequest, accepted = true, override: Partial<GameMotionResult> = {}) => {
    if (request.type !== 'reserve' && request.type !== 'heartbeat' && request.type !== 'play')
      throw new Error('Only requests with acknowledgements can receive a response')
    return remote.context.emit(gameMotionResult, {
      modelId: request.modelId,
      ownerId: request.ownerId,
      sessionId: request.sessionId,
      requestId: request.requestId,
      instanceId,
      type: request.type,
      accepted,
      ...override,
    })
  }
  remote.context.on(gameMotionRequest, ({ body }) => {
    const parsed = v.safeParse(gameMotionRequestSchema, body)
    if (!parsed.success || parsed.output.modelId !== modelId)
      return
    const request = parsed.output
    requests.push(request)
    if ((automaticReserve && request.type === 'reserve') || (automaticHeartbeat && request.type === 'heartbeat'))
      void respond(request)
  })
  cleanups.push(() => {
    remote.dispose()
    channel.close()
  })
  const port = createGameMotionPort(() => selectedModel.value)
  cleanups.push(() => port.dispose())
  return { port, requests, respond, remote, selectedModel, instanceId }
}

async function requestAt(requests: GameMotionRequest[], type: GameMotionRequest['type'], index = 0) {
  await expect.poll(() => requests.filter(request => request.type === type).length, { timeout: 2000 }).toBeGreaterThan(index)
  return requests.filter(request => request.type === type)[index]!
}

describe('game motion port over BroadcastChannel', () => {
  it('waits for the correlated reservation and playback completion', async () => {
    const { port, requests, respond, instanceId } = setup(false)
    port.sessionChanged(1)
    let settled = false
    const acquisition = Promise.resolve(port.acquire(intent, new AbortController().signal)).then((lease) => {
      settled = true
      return lease
    })
    const reserve = await requestAt(requests, 'reserve')
    await respond(reserve, false, { requestId: 'unrelated' })
    await respond(reserve, false, { ownerId: 'another-port' })
    await respond(reserve, false, { sessionId: 2 })
    await respond(reserve, false, { modelId: 'another-avatar' })
    expect(settled).toBe(false)
    expect(requests.some(request => request.type === 'play')).toBe(false)
    await respond(reserve)
    const lease = await acquisition
    expect(lease).toBeDefined()
    let played = false
    const playback = lease!.play(intent, new AbortController().signal)
    void Promise.resolve(playback).then(() => {
      played = true
    })
    const play = await requestAt(requests, 'play')
    expect('instanceId' in play && play.instanceId).toBe(instanceId)
    expect(play.ownerId).toBe(reserve.ownerId)
    await respond(play, true, { instanceId: 'reloaded-instance' })
    await requestAt(requests, 'heartbeat')
    expect(played).toBe(false)
    await respond(play)
    await playback
    const release = await requestAt(requests, 'release-lease')
    expect(release.ownerId).toBe(play.ownerId)
    expect('leaseId' in release && 'leaseId' in play && release.leaseId).toBe('leaseId' in play && play.leaseId)
    expect(lease!.signal.aborted).toBe(true)
  })

  it('keeps session priority between gestures and gives each gesture its own lease', async () => {
    const { port, requests, respond } = setup()
    port.sessionChanged(1)
    const first = await port.acquire(intent, new AbortController().signal)
    const firstPlayback = first!.play(intent, new AbortController().signal)
    const firstPlay = await requestAt(requests, 'play')
    await respond(firstPlay)
    await firstPlayback
    await requestAt(requests, 'heartbeat')
    expect(requests.some(request => request.type === 'release-session')).toBe(false)
    const nextIntent = { ...intent, revision: 2 }
    const second = await port.acquire(nextIntent, new AbortController().signal)
    const secondPlayback = second!.play(nextIntent, new AbortController().signal)
    const secondPlay = await requestAt(requests, 'play', 1)
    expect('leaseId' in firstPlay && 'leaseId' in secondPlay && firstPlay.leaseId).not.toBe('leaseId' in secondPlay && secondPlay.leaseId)
    first!.release()
    expect(second!.signal.aborted).toBe(false)
    await respond(secondPlay)
    await secondPlayback
    port.sessionChanged(null)
    const release = await requestAt(requests, 'release-session')
    expect(release.ownerId).toBe(secondPlay.ownerId)
  })

  it('refuses a denied reservation and concurrent acquisitions', async () => {
    const { port, requests, respond } = setup(false)
    port.sessionChanged(1)
    const first = port.acquire(intent, new AbortController().signal)
    await expect(port.acquire(intent, new AbortController().signal)).resolves.toBeUndefined()
    const reserve = await requestAt(requests, 'reserve')
    await respond(reserve, false)
    await expect(first).resolves.toBeUndefined()
    expect(requests.some(request => request.type === 'play')).toBe(false)
  })

  it('cancels acquisition without releasing the whole active game', async () => {
    const { port, requests, respond } = setup(false)
    const controller = new AbortController()
    port.sessionChanged(1)
    const acquisition = port.acquire(intent, controller.signal)
    const reserve = await requestAt(requests, 'reserve')
    controller.abort()
    await expect(acquisition).resolves.toBeUndefined()
    await respond(reserve)
    const lease = await port.acquire(intent, new AbortController().signal)
    expect(lease).toBeDefined()
    expect(requests.some(request => request.type === 'release-session')).toBe(false)
  })

  it('isolates reused session numbers and releases late reservations', async () => {
    const { port, requests, respond, remote, instanceId } = setup(false)
    port.sessionChanged(1)
    const old = await requestAt(requests, 'reserve')
    port.sessionChanged(null)
    port.sessionChanged(1)
    const current = await requestAt(requests, 'reserve', 1)
    expect(current.ownerId).not.toBe(old.ownerId)
    await respond(old)
    const release = await requestAt(requests, 'release-session')
    expect(release.ownerId).toBe(old.ownerId)
    await respond(current)
    const lease = await port.acquire(intent, new AbortController().signal)
    await remote.context.emit(gameMotionRevoked, { modelId: old.modelId, instanceId, ownerId: old.ownerId, sessionId: old.sessionId })
    expect(lease!.signal.aborted).toBe(false)
    await remote.context.emit(gameMotionRevoked, { modelId: current.modelId, instanceId, ownerId: current.ownerId, sessionId: current.sessionId })
    await expect.poll(() => lease!.signal.aborted).toBe(true)
    await expect(port.acquire(intent, new AbortController().signal)).resolves.toBeUndefined()
  })

  it('aborts immediately when the selected model changes and rejects further playback', async () => {
    const { port, requests, selectedModel, instanceId } = setup()
    port.sessionChanged(1)
    const lease = await port.acquire(intent, new AbortController().signal)
    selectedModel.value = `next-${crypto.randomUUID()}`
    expect(lease!.signal.aborted).toBe(true)
    await lease!.play(intent, new AbortController().signal)
    expect(requests.some(request => request.type === 'play')).toBe(false)
    const release = await requestAt(requests, 'release-session')
    expect(release.modelId).not.toBe(selectedModel.value)
    expect('instanceId' in release && release.instanceId).toBe(instanceId)
  })

  it('cleans up a reservation acknowledged after disposal', async () => {
    const { port, requests, respond } = setup(false)
    port.sessionChanged(1)
    const reserve = await requestAt(requests, 'reserve')
    port.dispose()
    await respond(reserve)
    const release = await requestAt(requests, 'release-session')
    expect(release.ownerId).toBe(reserve.ownerId)
    expect(release.sessionId).toBe(reserve.sessionId)
    await expect(port.acquire(intent, new AbortController().signal)).resolves.toBeUndefined()
  })

  it('releases only the cancelled playback lease and ignores its late result', async () => {
    const { port, requests, respond } = setup()
    port.sessionChanged(1)
    const first = await port.acquire(intent, new AbortController().signal)
    const controller = new AbortController()
    const firstPlayback = first!.play(intent, controller.signal)
    const firstRequest = await requestAt(requests, 'play')
    controller.abort()
    await firstPlayback
    expect(first!.signal.aborted).toBe(true)
    const nextIntent = { ...intent, revision: 2 }
    const second = await port.acquire(nextIntent, new AbortController().signal)
    const secondPlayback = second!.play(nextIntent, new AbortController().signal)
    const secondRequest = await requestAt(requests, 'play', 1)
    await respond(firstRequest)
    const release = await requestAt(requests, 'release-lease')
    expect('leaseId' in release && release.leaseId).toBe('leaseId' in firstRequest && firstRequest.leaseId)
    expect(second!.signal.aborted).toBe(false)
    await respond(secondRequest)
    await secondPlayback
  })

  it('aborts the lease when the host rejects its heartbeat', async () => {
    const { port, requests, respond } = setup(true, false)
    port.sessionChanged(1)
    const lease = await port.acquire(intent, new AbortController().signal)
    const heartbeat = await requestAt(requests, 'heartbeat')
    await respond(heartbeat, false)
    await expect.poll(() => lease!.signal.aborted).toBe(true)
    const release = await requestAt(requests, 'release-session')
    expect(release.ownerId).toBe(heartbeat.ownerId)
  })

  it('bounds an unresponsive heartbeat without sending parallel retries', async () => {
    const { port, requests } = setup(true, false)
    port.sessionChanged(1)
    const lease = await port.acquire(intent, new AbortController().signal)
    await expect.poll(() => lease!.signal.aborted, { timeout: 4500 }).toBe(true)
    expect(requests.filter(request => request.type === 'heartbeat')).toHaveLength(1)
    await requestAt(requests, 'release-session')
  }, 5500)

  it('bounds missing reservation responses to three seconds', async () => {
    const { port } = setup(false)
    port.sessionChanged(1)
    await expect(port.acquire(intent, new AbortController().signal)).resolves.toBeUndefined()
  }, 5000)

  it('expires an unused lease after five seconds', async () => {
    const { port, requests } = setup()
    port.sessionChanged(1)
    const lease = await port.acquire(intent, new AbortController().signal)
    await expect.poll(() => lease!.signal.aborted, { timeout: 6000 }).toBe(true)
    await requestAt(requests, 'release-lease')
    expect(requests.some(request => request.type === 'release-session')).toBe(false)
  }, 7000)
})
