import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'

import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'

export async function setupServerChannel() {
  const log = useLogg('main/server-runtime').useGlobalConfig()

  // Start the server-runtime server with WebSocket support
  try {
    // Dynamically import the server-runtime and listhen
    const serverRuntime = await import('@proj-airi/server-runtime')
    const { serve } = await import('h3')
    const { plugin: ws } = await import('crossws/server')

    try {
      const serverInstance = serve(serverRuntime.app, {
      // TODO: fix types
      // @ts-expect-error - the .crossws property wasn't extended in types
        plugins: [ws({ resolve: async req => (await serverRuntime.app.fetch(req)).crossws })],
        port: env.PORT ? Number(env.PORT) : 6121,
        hostname: env.SERVER_RUNTIME_HOSTNAME || 'localhost',
        reusePort: true,
        silent: true,
        gracefulShutdown: {
          forceTimeout: 0.5,
          gracefulTimeout: 0.5,
        },
      })

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

      log.log('@proj-airi/server-runtime started on ws://localhost:6121')
    }
    catch (error) {
      log.withError(error).error('failed to start WebSocket server')
    }
  }
  catch (error) {
    log.withError(error).error('failed to start WebSocket server')
  }
}
