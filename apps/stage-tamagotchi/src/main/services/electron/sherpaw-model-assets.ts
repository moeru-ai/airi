import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { net, protocol } from 'electron'

const modelAssetName = /^\/(?:preload-[\w-]+\.data|preload\.js-[\w-]+\.metadata)$/

/**
 * Serves only Sherpaw model assets from the renderer build directory.
 *
 * Triggering workflow:
 *
 * `Sherpaw` asset URL in the renderer
 *   -> `airi-sherpaw://assets/<filename>` request
 *     -> `protocol.handle`
 *       -> `net.fetch` from the renderer assets directory
 */
export function setupSherpawModelAssetsProtocol(rendererDirectory: string): void {
  // NOTICE:
  // Renderer fetch cannot read local model files through file:// in Electron.
  // Sherpaw loads its model pair with fetch before it starts a Worker session.
  // Source: Electron protocol.handle documentation and the Electron preview smoke test.
  // Removal condition: the renderer uses a fetchable application protocol for local assets.
  protocol.handle('airi-sherpaw', async (request) => {
    const url = new URL(request.url)
    if (url.host !== 'assets' || !modelAssetName.test(url.pathname))
      return new Response('Not Found', { status: 404 })

    const filename = url.pathname.slice(1)
    const fileURL = pathToFileURL(join(rendererDirectory, 'assets', filename))
    const response = await net.fetch(fileURL.href, { signal: request.signal })
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  })
}
