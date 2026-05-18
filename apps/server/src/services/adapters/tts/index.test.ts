import { describe, expect, it } from 'vitest'

import { ApiError } from '../../../utils/error'
import { getAdapter } from './index'

describe('getAdapter', () => {
  it('returns the azure adapter by id', () => {
    const adapter = getAdapter('azure')
    expect(adapter.id).toBe('azure')
  })

  it('returns the dashscope-cosyvoice adapter by id', () => {
    const adapter = getAdapter('dashscope-cosyvoice')
    expect(adapter.id).toBe('dashscope-cosyvoice')
  })

  it('returns the volcengine adapter by id', () => {
    const adapter = getAdapter('volcengine')
    expect(adapter.id).toBe('volcengine')
  })

  it('throws BAD_REQUEST on unknown id with the available list in details', () => {
    expect(() => getAdapter('unknown-provider')).toThrow(ApiError)
    try {
      getAdapter('unknown-provider')
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.statusCode).toBe(400)
      expect(apiErr.errorCode).toBe('BAD_REQUEST')
      expect(apiErr.details).toEqual(
        expect.objectContaining({
          id: 'unknown-provider',
          available: expect.arrayContaining(['azure', 'dashscope-cosyvoice', 'volcengine']),
        }),
      )
    }
  })

  it('each adapter has send and getVoiceCatalog functions', () => {
    for (const id of ['azure', 'dashscope-cosyvoice', 'volcengine'] as const) {
      const adapter = getAdapter(id)
      expect(typeof adapter.send).toBe('function')
      expect(typeof adapter.getVoiceCatalog).toBe('function')
      // U6 wires real catalogs; U5 stub returns []
      expect(Array.isArray(adapter.getVoiceCatalog())).toBe(true)
    }
  })
})
