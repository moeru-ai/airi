import { afterEach, describe, expect, it } from 'vitest'

import { createCubism2CoreOptions } from './index'

const originalEnvironment = {
  path: process.env.AIRI_CUBISM2_CORE_PATH,
  pathSha256: process.env.AIRI_CUBISM2_CORE_SHA256,
  url: process.env.AIRI_CUBISM2_CORE_URL,
  urlSha256: process.env.AIRI_CUBISM2_CORE_URL_SHA256,
}

afterEach(() => {
  for (const [key, value] of Object.entries({
    AIRI_CUBISM2_CORE_PATH: originalEnvironment.path,
    AIRI_CUBISM2_CORE_SHA256: originalEnvironment.pathSha256,
    AIRI_CUBISM2_CORE_URL: originalEnvironment.url,
    AIRI_CUBISM2_CORE_URL_SHA256: originalEnvironment.urlSha256,
  })) {
    if (value === undefined)
      delete process.env[key]
    else
      process.env[key] = value
  }
})

describe('cubism 2 Core SDK policy', () => {
  it('keeps AIRI source precedence while delegating provisioning', () => {
    process.env.AIRI_CUBISM2_CORE_PATH = 'licensed/live2d.min.js'
    process.env.AIRI_CUBISM2_CORE_SHA256 = 'a'.repeat(64)
    process.env.AIRI_CUBISM2_CORE_URL = 'https://example.com/live2d.min.js'
    process.env.AIRI_CUBISM2_CORE_URL_SHA256 = 'b'.repeat(64)

    const options = createCubism2CoreOptions({ distribution: 'bundle' })

    expect(options.distribution).toBe('bundle')
    expect(options.timeout).toBe(10_000)
    expect(options.sources?.[0]).toEqual({
      path: 'licensed/live2d.min.js',
      sha256: 'a'.repeat(64),
      optional: true,
    })
    expect(options.sources?.[1]).toMatchObject({ optional: true })
    expect(options.sources?.[2]).toEqual({
      url: 'https://example.com/live2d.min.js',
      sha256: 'b'.repeat(64),
      optional: true,
    })
  })

  it('never forwards an unverified URL source to the SDK', () => {
    delete process.env.AIRI_CUBISM2_CORE_PATH
    delete process.env.AIRI_CUBISM2_CORE_SHA256
    process.env.AIRI_CUBISM2_CORE_URL = 'https://example.com/unverified.js'
    delete process.env.AIRI_CUBISM2_CORE_URL_SHA256

    const options = createCubism2CoreOptions({ distribution: 'development-only' })

    expect(options.sources).toHaveLength(1)
    expect(options.sources?.[0]).toMatchObject({ path: expect.any(String), optional: true })
  })
})
