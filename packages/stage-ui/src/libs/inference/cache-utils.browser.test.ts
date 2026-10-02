import { afterEach, describe, expect, it } from 'vitest'

import { fetchCachedModel, isModelCached } from './cache-utils'

const url = new URL('./cache-utils.ts?raw', import.meta.url)

describe('sherpaw model cache', () => {
  afterEach(async () => {
    const cache = await caches.open('sherpaw-models')
    await cache.delete(url)
  })

  it('stores a model response and reuses it for the next segment', async () => {
    const cache = await caches.open('sherpaw-models')
    await cache.delete(url)

    const first = await fetchCachedModel(url)
    const body = await first.text()
    expect(first.ok).toBe(true)
    expect(body).toContain('getModelCacheSize')
    expect(await isModelCached('cache-utils.ts')).toBe(true)

    await cache.put(url, new Response('cached model'))
    const second = await fetchCachedModel(url)
    expect(await second.text()).toBe('cached model')
  })
})
