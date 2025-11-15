import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'

import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'

export async function setupChannelServer() {
  const log = useLogg('main/server-runtime').useGlobalConfig()

  // Start the server-runtime server with WebSocket support
  try {
    // Dynamically import the server-runtime and listhen
    const serverRuntime = await import('@proj-airi/server-runtime')
    const { serve } = await import('h3')
    const { plugin: ws } = await import('crossws/server')

    const serverInstance = serve(serverRuntime.app, {
      // TODO: fix types
      // @ts-ignore-err
      plugins: [ws({ resolve: async req => (await serverRuntime.app.fetch(req)).crossws })],
      port: env.PORT ? Number(env.PORT) : 6121,
      hostname: env.SERVER_RUNTIME_HOSTNAME || 'localhost',
      reusePort: true,
      gracefulShutdown: {
        forceTimeout: 500,
        gracefulTimeout: 500,
      },
    })

    log.log('@proj-airi/server-runtime started on ws://localhost:6121')

    onAppBeforeQuit(async () => {
      if (serverInstance && typeof serverInstance.close === 'function') {
        try {
          await serverInstance.close()
          log.log('WebSocket server closed')
        }
        catch (error) {
          log.withError(error).error('Error closing WebSocket server')
        }
      }
    })
  }
  catch (error) {
    log.withError(error).error('failed to start WebSocket server')
  }
}
