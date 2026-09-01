import { whiteboardExtension, whiteboardManifest } from '@proj-airi/airi-extension-whiteboard'
import { StageGameletController } from '@proj-airi/plugin-sdk-stage/gamelet/controller'
import { installStageHostKits } from '@proj-airi/plugin-sdk-stage/host'
import { BundledExtensionLoader, ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'
import { clearExtensionTools, synchronizeExtensionTools } from '@proj-airi/stage-ui/stores/ai/chat-llm/extension-tools'

const controller = new StageGameletController()
const host = new ExtensionHost({
  loader: new BundledExtensionLoader([{ extension: whiteboardExtension, manifest: whiteboardManifest }]),
  runtime: 'web',
})
const tools = installStageHostKits({ host, gamelets: controller })
let sessionId: string | undefined
let startPromise: Promise<void> | undefined

/** Starts the Extension definitions bundled with Pocket. */
export function startOfficialExtensions() {
  startPromise ??= (async () => {
    const session = await host.start(whiteboardManifest)
    sessionId = session.id
    await synchronizeExtensionTools(tools)
  })()
  return startPromise
}

/** Stops official extensions and removes their model tools. */
export async function stopOfficialExtensions() {
  if (sessionId) {
    await host.stop(sessionId)
  }
  sessionId = undefined
  startPromise = undefined
  tools.clear()
  clearExtensionTools()
}

export { controller as officialGameletController }
