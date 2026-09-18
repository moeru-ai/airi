import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostDeveloperTools } from './developer-tools'

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

describe('host developer tools', () => {
  beforeEach(() => {
    runtime.value = 'kirie'
    invoke.mockReset().mockResolvedValue({})
  })

  it('sends explicit empty payloads and window geometry through Kirie', async () => {
    const developerTools = useHostDeveloperTools()
    const windowPayload = {
      key: 'io-tracer',
      route: '/devtools/io-tracer',
      width: 1600,
      height: 900,
    }

    await developerTools.openWebInspector()
    await developerTools.openEditor()
    await developerTools.openWindow(windowPayload)

    expect(invoke).toHaveBeenNthCalledWith(1, 'eventa:invoke:electron:windows:main:devtools:open-send', {})
    expect(invoke).toHaveBeenNthCalledWith(2, 'eventa:invoke:electron:windows:editor:open-send', {})
    expect(invoke).toHaveBeenNthCalledWith(3, 'eventa:invoke:electron:windows:devtools:open-send', windowPayload)
  })

  it('preserves Electron invoke payloads', async () => {
    runtime.value = 'electron'
    const developerTools = useHostDeveloperTools()
    const windowPayload = {
      key: 'markdown-stress',
      route: '/devtools/markdown-stress',
    }

    await developerTools.openWebInspector()
    await developerTools.openEditor()
    await developerTools.openWindow(windowPayload)

    expect(invoke).toHaveBeenNthCalledWith(1, 'eventa:invoke:electron:windows:main:devtools:open-send')
    expect(invoke).toHaveBeenNthCalledWith(2, 'eventa:invoke:electron:windows:editor:open-send')
    expect(invoke).toHaveBeenNthCalledWith(3, 'eventa:invoke:electron:windows:devtools:open-send', windowPayload)
  })
})
