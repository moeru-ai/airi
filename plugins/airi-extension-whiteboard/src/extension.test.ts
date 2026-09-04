import { StageGameletController } from '@proj-airi/plugin-sdk-stage/gamelet/controller'
import { installStageHostKits } from '@proj-airi/plugin-sdk-stage/host'
import { BundledExtensionLoader, ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'
import { describe, expect, it, vi } from 'vitest'

import { executeWhiteboardCommand } from './commands'
import { whiteboardExtension, whiteboardManifest } from './extension'
import { WhiteboardStore } from './model'

describe('whiteboard extension host integration', () => {
  it('routes a model tool and manual edit to the same UI-owned document, then removes tools on unload', async () => {
    const controller = new StageGameletController()
    const host = new ExtensionHost({
      loader: new BundledExtensionLoader([{ extension: whiteboardExtension, manifest: whiteboardManifest }]),
      runtime: 'web',
    })
    const registry = installStageHostKits({ host, gamelets: controller })
    const store = new WhiteboardStore()
    const session = await host.start(whiteboardManifest)

    expect((await registry.listSerializedXsaiTools()).tools.map(tool => tool.name)).toHaveLength(9)

    const toolInvocation = registry.invoke('airi-extension-whiteboard', 'create_canvas', { name: 'Shared state' })
    await vi.waitFor(() => expect(controller.isOpen('whiteboard:main')).resolves.toBe(true))
    const disconnect = controller.connect('whiteboard:main', payload => executeWhiteboardCommand(store, payload))
    const created = await toolInvocation
    const canvas = (created as { canvas: { id: string } }).canvas

    executeWhiteboardCommand(store, { type: 'add_text', canvasId: canvas.id, value: 'Manual edit', x: 10, y: 10 })
    expect(store.document.canvases[0]?.texts).toHaveLength(1)

    await host.stop(session.id)
    expect((await registry.listSerializedXsaiTools()).tools).toEqual([])

    disconnect()
    controller.dispose()
  })
})
