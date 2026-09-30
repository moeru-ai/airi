import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostOnboarding } from './onboarding'

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
  }),
}))

describe('host onboarding', () => {
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue({})
  })

  it('sends explicit empty payloads through Kirie', async () => {
    const onboarding = useHostOnboarding()

    await onboarding.open()
    await onboarding.close()

    expect(invoke).toHaveBeenNthCalledWith(1, 'eventa:invoke:electron:windows:onboarding:open-send', {})
    expect(invoke).toHaveBeenNthCalledWith(2, 'eventa:invoke:electron:windows:onboarding:close-send', {})
  })
})
