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

    const app = serverRuntime.setupApp()

    const serverInstance = serve(app, {
      // TODO: add proper crossws typing upstream
      plugins: [ws({ resolve: async req => (await app.fetch(req) as any).crossws })],
      port: env.PORT ? Number(env.PORT) : 6121,
      hostname: env.SERVER_RUNTIME_HOSTNAME || 'localhost',
      reusePort: true,
      silent: true,
      manual: true,
      gracefulShutdown: {
        forceTimeout: 0.5,
        gracefulTimeout: 0.5,
      },
    })

    const servePromise = serverInstance.serve()
    if (servePromise instanceof Promise) {
      servePromise.catch((error) => {
        const nodejsError = error as NodeJS.ErrnoException
        if ('code' in nodejsError && nodejsError.code === 'EADDRINUSE') {
          log.withError(error).warn('Port already in use, assuming server is already running')
          return
        }

        log.withError(error).error('Error serving WebSocket server')
      })
    }

    onAppBeforeQuit(async () => {
      if (serverInstance && typeof serverInstance.close === 'function') {
        try {
          await serverInstance.close()
          log.log('WebSocket server closed')
        }
        catch (error) {
          const nodejsError = error as NodeJS.ErrnoException
          if ('code' in nodejsError && nodejsError.code === 'ERR_SERVER_NOT_RUNNING') {
            return
          }

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
