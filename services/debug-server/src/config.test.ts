import { describe, expect, it } from 'vitest'

import { loadConfig } from './config'

describe('loadConfig', () => {
  it('parses defaults and generates an independent token for each startup', () => {
    const config = loadConfig({})
    expect(config).toMatchObject({
      host: '127.0.0.1',
      port: 6122,
      maxRequestBytes: 1048576,
      maxConcurrentIngests: 8,
      maxStoredBytes: 1073741824,
      retentionDays: 7,
      tokenGenerated: true,
    })
    expect(config.allowedOrigins).toEqual(new Set(['http://localhost:5173', 'http://127.0.0.1:5173']))
    expect(config.token).toMatch(/^[\w-]{32}$/)
    expect(loadConfig({}).token).not.toBe(config.token)
  })

  it('parses explicit values without treating empty origins as missing', () => {
    expect(loadConfig({
      AIRI_DEBUG_TOKEN: 'local-test',
      AIRI_DEBUG_ALLOWED_ORIGINS: '',
      AIRI_DEBUG_PORT: '65535',
      AIRI_DEBUG_HOST: '::1',
      AIRI_DEBUG_RETENTION_DAYS: '2',
    })).toMatchObject({
      token: 'local-test',
      tokenGenerated: false,
      allowedOrigins: new Set(),
      port: 65535,
      host: '::1',
      retentionDays: 2,
    })
  })

  it.each(['', '0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992'])('rejects invalid limits: %s', (value) => {
    for (const key of ['AIRI_DEBUG_PORT', 'AIRI_DEBUG_RETENTION_DAYS', 'AIRI_DEBUG_MAX_REQUEST_BYTES', 'AIRI_DEBUG_MAX_CONCURRENT_INGESTS', 'AIRI_DEBUG_MAX_STORED_BYTES'])
      expect(() => loadConfig({ [key]: value })).toThrow(`${key} must be a positive integer`)
  })

  it('rejects invalid host and port values', () => {
    expect(() => loadConfig({ AIRI_DEBUG_HOST: '0.0.0.0' })).toThrow('loopback host')
    expect(() => loadConfig({ AIRI_DEBUG_PORT: '65536' })).toThrow('must not exceed 65535')
  })

  it('rejects an empty explicit token', () => {
    expect(() => loadConfig({ AIRI_DEBUG_TOKEN: '' })).toThrow('AIRI_DEBUG_TOKEN must not be empty')
  })
})
