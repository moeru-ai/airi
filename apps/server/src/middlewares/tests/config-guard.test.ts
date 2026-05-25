import { describe, expect, it, vi } from 'vitest'

import type { ApiError } from '../../utils/error'

import { configGuard } from '../config-guard'

describe('configGuard', () => {
  it('calls next when every required config key resolves', async () => {
    const configKV = {
      getOptional: vi.fn(async () => 'set'),
    }
    const middleware = configGuard(configKV as Parameters<typeof configGuard>[0], ['DEFAULT_CHAT_MODEL', 'DEFAULT_TTS_MODEL'])
    const next = vi.fn(async () => undefined)

    await middleware({} as Parameters<typeof middleware>[0], next)

    expect(configKV.getOptional).toHaveBeenCalledTimes(2)
    expect(configKV.getOptional).toHaveBeenNthCalledWith(1, 'DEFAULT_CHAT_MODEL')
    expect(configKV.getOptional).toHaveBeenNthCalledWith(2, 'DEFAULT_TTS_MODEL')
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('throws CONFIG_NOT_SET and stops at the first missing key', async () => {
    const configKV = {
      getOptional: vi
        .fn()
        .mockResolvedValueOnce('set')
        .mockResolvedValueOnce(null),
    }
    const middleware = configGuard(
      configKV as Parameters<typeof configGuard>[0],
      ['DEFAULT_CHAT_MODEL', 'DEFAULT_TTS_MODEL', 'LLM_ROUTER_CONFIG'],
      'Router is not ready',
    )
    const next = vi.fn(async () => undefined)

    await expect(middleware({} as Parameters<typeof middleware>[0], next)).rejects.toMatchObject({
      statusCode: 503,
      errorCode: 'CONFIG_NOT_SET',
      message: 'Router is not ready',
    } satisfies Partial<ApiError>)

    expect(configKV.getOptional).toHaveBeenCalledTimes(2)
    expect(next).not.toHaveBeenCalled()
  })
})
