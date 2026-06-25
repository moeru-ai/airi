import type { AddressInfo } from 'node:net'

import type { ViteDevServer } from 'vite'

import { createServer } from 'vite'

export interface ManagedViteServer {
  baseUrl: string
  close: () => Promise<void>
}

function resolveViteServerUrl(server: ViteDevServer, sceneAppRoot: string): string {
  const url = server.resolvedUrls?.local?.[0] ?? server.resolvedUrls?.network?.[0]

  if (url) {
    return url
  }

  const address = server.httpServer?.address()

  if (!address || typeof address === 'string') {
    throw new Error(`Unable to determine Vite dev server address for ${sceneAppRoot}`)
  }

  const { address: host, port } = address as AddressInfo

  return `http://${host}:${port}`
}

export async function startSceneViteServer(sceneAppRoot: string): Promise<ManagedViteServer> {
  const server = await createServer({
    root: sceneAppRoot,
    server: {
      host: '127.0.0.1',
      port: 41731,
      strictPort: false,
      // NOTICE:
      // Disabling the file watcher prevents asynchronous file unlink/add events from firing.
      // During test teardown, deleting temporary fixture roots triggers file watcher events after server shutdown.
      // packages/vishot-runner-browser/src/runtime/vite-server.ts
      // Can be safely removed if scene capture runs in a persistent environment without rapid cleanup.
      watch: null,
    },
  })

  await server.listen()

  return {
    baseUrl: resolveViteServerUrl(server, sceneAppRoot),
    close: async () => {
      await server.close()
    },
  }
}
