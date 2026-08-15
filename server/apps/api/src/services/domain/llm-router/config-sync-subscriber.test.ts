import type Redis from 'ioredis'

import { describe, expect, it, vi } from 'vitest'

import { createConfigSyncSubscriber } from './config-sync-subscriber'

function createHarness() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  const subscriber = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
      return subscriber
    }),
    subscribe: vi.fn(async () => 1),
    emit(event: string, ...args: unknown[]) {
      for (const handler of handlers.get(event) ?? [])
        handler(...args)
    },
  }
  const redis = { duplicate: vi.fn(() => subscriber) } as unknown as Redis
  const configKV = { invalidateCache: vi.fn(async () => {}) }
  const llmRouter = {
    invalidateConfig: vi.fn(),
    invalidateTtsVoicesCache: vi.fn(async () => {}),
  }
  const logger = {
    withError: vi.fn(() => logger),
    warn: vi.fn(),
  }

  createConfigSyncSubscriber({
    redis,
    configKV,
    llmRouter: llmRouter as never,
    gatewayMetrics: null,
    instanceId: 'api-test',
    logger: logger as never,
  })

  return { configKV, llmRouter, subscriber }
}

function message(key: string) {
  return JSON.stringify({ key, version: 1, publishedAt: Date.now() })
}

describe('configKV sync subscriber', () => {
  it('invalidates router and voice state for LLM_ROUTER_CONFIG', async () => {
    const harness = createHarness()

    harness.subscriber.emit('message', 'configkv:invalidate', message('LLM_ROUTER_CONFIG'))

    expect(harness.llmRouter.invalidateConfig).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(harness.llmRouter.invalidateTtsVoicesCache).toHaveBeenCalledTimes(1))
  })

  it('invalidates only voice state for UNSPEECH_UPSTREAM', async () => {
    const harness = createHarness()

    harness.subscriber.emit('message', 'configkv:invalidate', message('UNSPEECH_UPSTREAM'))

    expect(harness.llmRouter.invalidateConfig).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(harness.llmRouter.invalidateTtsVoicesCache).toHaveBeenCalledTimes(1))
  })

  it('ignores ordinary ConfigKV notifications', () => {
    const harness = createHarness()

    harness.subscriber.emit('message', 'configkv:invalidate', message('FLUX_PER_REQUEST'))

    expect(harness.llmRouter.invalidateConfig).not.toHaveBeenCalled()
    expect(harness.llmRouter.invalidateTtsVoicesCache).not.toHaveBeenCalled()
  })

  it('clears derived caches and local state after Redis reconnects', async () => {
    const harness = createHarness()

    harness.subscriber.emit('ready')

    await vi.waitFor(() => {
      expect(harness.configKV.invalidateCache).toHaveBeenCalledTimes(2)
      expect(harness.llmRouter.invalidateConfig).toHaveBeenCalledTimes(1)
      expect(harness.llmRouter.invalidateTtsVoicesCache).toHaveBeenCalledTimes(1)
    })
    expect(harness.configKV.invalidateCache).toHaveBeenNthCalledWith(1, 'LLM_ROUTER_CONFIG')
    expect(harness.configKV.invalidateCache).toHaveBeenNthCalledWith(2, 'UNSPEECH_UPSTREAM')
  })
})
