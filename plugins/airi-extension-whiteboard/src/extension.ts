import type { ExtensionManifestV1 } from '@proj-airi/plugin-sdk/plugin-host'

import { defineExtension } from '@proj-airi/plugin-sdk'
import { createGamelet } from '@proj-airi/plugin-sdk-stage/kits/gamelet'
import { registerTools } from '@proj-airi/plugin-sdk-stage/kits/tool'

import { createWhiteboardTools } from './tools'

/** Official manifest for the local whiteboard extension. */
export const whiteboardManifest = {
  apiVersion: 'v1',
  kind: 'manifest.extension.airi.moeru.ai',
  id: 'airi-extension-whiteboard',
  permissions: {
    apis: [
      { key: 'kit.gamelet', actions: ['invoke'] },
      { key: 'kit.tool', actions: ['invoke'] },
    ],
    resources: [
      { key: 'proj-airi:plugin-sdk:resources:kits:kit.gamelet:bindings', actions: ['write'] },
    ],
  },
  entrypoints: {
    default: './dist/index.mjs',
    electron: './dist/index.mjs',
    web: './dist/index.mjs',
  },
} satisfies ExtensionManifestV1

/** The official extension definition loaded by every bundled stage host. */
export const whiteboardExtension = defineExtension({
  id: whiteboardManifest.id,
  async setup(context) {
    const module = await context.modules.register({ id: 'whiteboard' })
    const gamelet = await createGamelet(module, {
      id: 'main',
      title: 'Whiteboard',
      indexPath: 'ui/index.html',
    })
    await registerTools(module, { tools: createWhiteboardTools(gamelet) })
  },
})
