import { describe, expect, it, vi } from 'vitest'

import { createTestRedis } from '../../../libs/tests/redis'
import { CONFIG_KV_INVALIDATION_CHANNEL } from '../../adapters/config-kv-contracts'
import { createConfigSyncSubscriber } from './config-sync-subscriber'

function createHarness() {
  const redis = createTestRedis()
  const configKV = { invalidateCache: vi.fn(async () => {}) }
  const llmRouter = {
    invalidateConfig: vi.fn(),
    invalidateTtsVoicesCache: vi.fn(async () => {}),
  }
  const logger = {
    withError: vi.fn(() => logger),
    warn: vi.fn(),
  }

  const { subscriber } = createConfigSyncSubscriber({
    redis,
    configKV,
    llmRouter: llmRouter as never,
    gatewayMetrics: null,
    instanceId: 'api-test',
    logger: logger as never,
  })

  return { configKV, llmRouter, redis, subscriber }
}

function message(key: string) {
  return JSON.stringify({ key, version: 1, publishedAt: Date.now() })
}

async function settleInitialReconnect(harness: ReturnType<typeof createHarness>): Promise<void> {
  await vi.waitFor(() => expect(harness.configKV.invalidateCache).toHaveBeenCalledTimes(2))
  harness.configKV.invalidateCache.mockClear()
  harness.llmRouter.invalidateConfig.mockClear()
  harness.llmRouter.invalidateTtsVoicesCache.mockClear()
}

async function publishInvalidation(harness: ReturnType<typeof createHarness>, key: string): Promise<void> {
  await harness.subscriber.subscribe(CONFIG_KV_INVALIDATION_CHANNEL)
  const received = new Promise<void>((resolve) => {
    harness.subscriber.once('message', () => resolve())
  })
  await harness.redis.publish(CONFIG_KV_INVALIDATION_CHANNEL, message(key))
  await received
}

describe('configKV sync subscriber', () => {
  it('invalidates router and voice state for LLM_ROUTER_CONFIG', async () => {
    const harness = createHarness()

    await settleInitialReconnect(harness)
    await publishInvalidation(harness, 'LLM_ROUTER_CONFIG')

    await vi.waitFor(() => expect(harness.llmRouter.invalidateConfig).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(harness.llmRouter.invalidateTtsVoicesCache).toHaveBeenCalledTimes(1))
  })

  it('invalidates only voice state for UNSPEECH_UPSTREAM', async () => {
    const harness = createHarness()

    await settleInitialReconnect(harness)
    await publishInvalidation(harness, 'UNSPEECH_UPSTREAM')

    await vi.waitFor(() => expect(harness.llmRouter.invalidateConfig).not.toHaveBeenCalled())
    await vi.waitFor(() => expect(harness.llmRouter.invalidateTtsVoicesCache).toHaveBeenCalledTimes(1))
  })

  it('ignores ordinary ConfigKV notifications', async () => {
    const harness = createHarness()

    await settleInitialReconnect(harness)
    await publishInvalidation(harness, 'FLUX_PER_REQUEST')

    expect(harness.llmRouter.invalidateConfig).not.toHaveBeenCalled()
    expect(harness.llmRouter.invalidateTtsVoicesCache).not.toHaveBeenCalled()
  })

  it('clears derived caches and local state after Redis reconnects', async () => {
    const harness = createHarness()

    await settleInitialReconnect(harness)
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
