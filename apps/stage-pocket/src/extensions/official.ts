import { whiteboardExtension, whiteboardManifest } from '@proj-airi/airi-extension-whiteboard'
import { StageGameletController } from '@proj-airi/plugin-sdk-stage/gamelet/controller'
import { installStageHostKits } from '@proj-airi/plugin-sdk-stage/host'
import { BundledExtensionLoader, ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'
import { createExtensionLifecycle } from '@proj-airi/stage-ui/libs/extensions/official-lifecycle'
import { clearExtensionTools, synchronizeExtensionTools } from '@proj-airi/stage-ui/stores/ai/chat-llm/extension-tools'

const controller = new StageGameletController()
const host = new ExtensionHost({
  loader: new BundledExtensionLoader([{ extension: whiteboardExtension, manifest: whiteboardManifest }]),
  runtime: 'web',
})
const tools = installStageHostKits({ host, gamelets: controller })
const lifecycle = createExtensionLifecycle({
  start: async () => await host.start(whiteboardManifest),
  stop: async sessionId => await host.stop(sessionId).then(() => undefined),
  synchronize: async () => await synchronizeExtensionTools(tools),
  clear: () => {
    tools.clear()
    clearExtensionTools()
  },
})

/** Starts the Extension definitions bundled with Pocket. */
export function startOfficialExtensions() {
  return lifecycle.start()
}

/** Stops official extensions and removes their model tools. */
export async function stopOfficialExtensions() {
  await lifecycle.stop()
}

export { controller as officialGameletController }
