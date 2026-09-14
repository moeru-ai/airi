import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostAuth } from './auth'

const runtime = vi.hoisted(() => ({ value: 'kirie' as 'electron' | 'kirie' }))
const invoke = vi.hoisted(() => vi.fn())

vi.mock('@moeru/eventa', async (importOriginal) => {
  const original = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...original,
    defineInvoke: (_context: unknown, event: { sendEvent: { id: string } }) => {
      return (...args: unknown[]) => invoke(event.sendEvent.id, ...args)
    },
  }
})

vi.mock('./owner', () => ({
  initializeHostContext: () => ({
    context: {},
    runtime: runtime.value,
  }),
}))

vi.mock('../../shared/auth-config', () => ({
  desktopAuthConfiguration: {
    clientId: 'staging-client',
    serverUrl: 'https://staging.example.test',
  },
}))

describe('host auth', () => {
  beforeEach(() => {
    runtime.value = 'kirie'
    invoke.mockReset().mockResolvedValue({})
  })

  it('sends explicit empty payloads through Kirie', async () => {
    const auth = useHostAuth()

    await auth.startLogin()
    await auth.logout()

    expect(invoke).toHaveBeenNthCalledWith(1, 'eventa:invoke:airi:auth:configure-send', {
      clientId: 'staging-client',
      serverUrl: 'https://staging.example.test',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'eventa:invoke:electron:auth:start-login-send', {})
    expect(invoke).toHaveBeenNthCalledWith(3, 'eventa:invoke:electron:auth:logout-send', {})
  })

  it('preserves the parameterless Electron invokes', async () => {
    runtime.value = 'electron'
    const auth = useHostAuth()

    await auth.startLogin()
    await auth.logout()

    expect(invoke).toHaveBeenNthCalledWith(1, 'eventa:invoke:electron:auth:start-login-send')
    expect(invoke).toHaveBeenNthCalledWith(2, 'eventa:invoke:electron:auth:logout-send')
  })
})
