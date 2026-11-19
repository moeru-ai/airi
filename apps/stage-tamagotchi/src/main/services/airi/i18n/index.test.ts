import { describe, expect, it, vi } from 'vitest'

import { createI18nService } from './index'

const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())
const injecaResolveMock = vi.hoisted(() => vi.fn())

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

vi.mock('injeca', () => ({
  injeca: {
    resolve: injecaResolveMock,
  },
}))

describe('createI18nService', () => {
  it('registers locale invoke handlers on successful config resolution', async () => {
    defineInvokeHandlerMock.mockClear()
    injecaResolveMock.mockReset()

    const configMock = {
      get: vi.fn(() => ({ language: 'ja' })),
      update: vi.fn(),
    }
    injecaResolveMock.mockResolvedValue({ config: configMock })

    const localeMock = vi.fn()
    const i18n = { locale: localeMock } as never
    const window = { isDestroyed: vi.fn(() => false) } as never
    const context = {} as never

    await createI18nService({ context, window, i18n })

    expect(localeMock).toHaveBeenCalledWith('ja')
    expect(defineInvokeHandlerMock).toHaveBeenCalledTimes(2)
  })

  it('rejects and skips invoke registration when signal is aborted during resolution', async () => {
    defineInvokeHandlerMock.mockClear()
    injecaResolveMock.mockReset()

    const pendingResolution = new Promise(() => {})
    injecaResolveMock.mockReturnValue(pendingResolution)

    const localeMock = vi.fn()
    const i18n = { locale: localeMock } as never
    const window = { isDestroyed: vi.fn(() => false) } as never
    const context = {} as never

    const controller = new AbortController()
    const servicePromise = createI18nService({ context, window, i18n, signal: controller.signal })

    controller.abort(new Error('Widget window was closed during setup'))

    await expect(servicePromise).rejects.toThrow('Widget window was closed during setup')
    expect(defineInvokeHandlerMock).not.toHaveBeenCalled()
    expect(localeMock).not.toHaveBeenCalled()
  })

  it('rejects when window is destroyed before setup starts', async () => {
    defineInvokeHandlerMock.mockClear()
    injecaResolveMock.mockReset()

    const i18n = { locale: vi.fn() } as never
    const window = { isDestroyed: vi.fn(() => true) } as never
    const context = {} as never

    await expect(createI18nService({ context, window, i18n })).rejects.toThrow(
      'Window was closed before i18n service setup',
    )
    expect(injecaResolveMock).not.toHaveBeenCalled()
    expect(defineInvokeHandlerMock).not.toHaveBeenCalled()
  })

  it('rejects and skips registration when window is destroyed during resolution', async () => {
    defineInvokeHandlerMock.mockClear()
    injecaResolveMock.mockReset()

    let isDestroyed = false
    const window = {
      isDestroyed: vi.fn(() => isDestroyed),
    } as never

    const configMock = {
      get: vi.fn(() => ({ language: 'en' })),
      update: vi.fn(),
    }
    injecaResolveMock.mockImplementation(async () => {
      isDestroyed = true
      return { config: configMock }
    })

    const localeMock = vi.fn()
    const i18n = { locale: localeMock } as never
    const context = {} as never

    await expect(createI18nService({ context, window, i18n })).rejects.toThrow(
      'Window was closed during i18n service setup',
    )
    expect(defineInvokeHandlerMock).not.toHaveBeenCalled()
  })
})
