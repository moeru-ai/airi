import { describe, expect, it, vi } from 'vitest'

import { useHostInlay } from './inlay'

const invoke = vi.hoisted(() => vi.fn(async (_id: string, _payload: unknown) => ({})))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const original = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...original,
    defineInvoke: (_context: unknown, event: { sendEvent: { id: string } }) =>
      (payload: unknown) => invoke(event.sendEvent.id, payload),
  }
})

vi.mock('./owner', () => ({ initializeHostContext: () => ({ context: {} }) }))

describe('inlay host context', () => {
  it('opens without activation and returns home through the native host', async () => {
    const inlay = useHostInlay()

    await inlay.open()
    expect(invoke).toHaveBeenCalledWith('eventa:invoke:airi:windows:inlay:open-send', {})

    await inlay.returnHome()
    expect(invoke).toHaveBeenCalledWith('eventa:invoke:airi:windows:inlay:return-home-send', {})
  })
})
