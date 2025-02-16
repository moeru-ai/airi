import { afterAll, vi } from 'vitest'

export function spyConsoleWarn() {
  const hookedConsoleWarn = console.warn
  const consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(hookedConsoleWarn)

  afterAll(() => {
    consoleWarnMock.mockReset()
  })

  return consoleWarnMock
}
