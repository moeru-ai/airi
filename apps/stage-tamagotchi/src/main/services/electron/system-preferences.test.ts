import { describe, expect, it, vi, beforeEach } from 'vitest'

const getMediaAccessStatus = vi.fn()
const askForMediaAccess = vi.fn()

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus,
    askForMediaAccess,
  },
}))

vi.mock('std-env', () => ({
  get isLinux() { return true },
  get isMacOS() { return false },
  get isWindows() { return false },
}))

const handlers: Array<{ event: any, handler: (...args: any[]) => any }> = []

vi.mock('@moeru/eventa', () => ({
  defineInvokeHandler: (_ctx: any, event: any, handler: any) => {
    handlers.push({ event, handler })
  },
}))

const { createSystemPreferencesService } = await import('./system-preferences')

describe('system-preferences service on Linux (#2132)', () => {
  beforeEach(() => {
    handlers.length = 0
    getMediaAccessStatus.mockReset()
    askForMediaAccess.mockReset()
  })

  it('getMediaAccessStatus returns not-determined without calling systemPreferences', () => {
    createSystemPreferencesService({ context: {} as any, window: {} as any })

    // First handler registered is getMediaAccessStatus
    const handler = handlers[0].handler
    const result = handler(['camera'])

    expect(result).toBe('not-determined')
    expect(getMediaAccessStatus).not.toHaveBeenCalled()
  })

  it('askForMediaAccess returns false without calling systemPreferences', async () => {
    createSystemPreferencesService({ context: {} as any, window: {} as any })

    // Second handler registered is askForMediaAccess
    const handler = handlers[1].handler
    const result = await handler(['camera'])

    expect(result).toBe(false)
    expect(askForMediaAccess).not.toHaveBeenCalled()
  })

  it('getMediaAccessStatus returns not-determined when type is empty', () => {
    createSystemPreferencesService({ context: {} as any, window: {} as any })

    const handler = handlers[0].handler
    const result = handler([])

    expect(result).toBe('not-determined')
  })
})
