import { Mutex } from 'async-mutex'
import { getRandomPort } from 'get-port-please'
import { serve } from 'h3'

export interface BuiltInServerAddress {
  host: string
  port: number
  baseUrl: string
}

/**
 * Creates a reusable local HTTP server lifecycle around an h3 app.
 *
 * Use when:
 * - A local HTTP module needs host/port assignment and start/stop lifecycle
 * - Callers may trigger concurrent start/stop operations
 *
 * Expects:
 * - `app` is a valid h3 app/handler accepted by `serve`
 * - Caller manages route registration before first `start`
 *
 * Returns:
 * - Idempotent lifecycle with serialized start/stop and runtime address getter
 */
export function createH3Server(options: {
  app: Parameters<typeof serve>[0]
  host?: string
  port?: number
  silent?: boolean
}) {
  const host = options.host ?? '127.0.0.1'
  const silent = options.silent ?? true
  const lifecycleMutex = new Mutex()

  let server: ReturnType<typeof serve> | undefined
  let address: BuiltInServerAddress | undefined

  return {
    async start(): Promise<BuiltInServerAddress> {
      return await lifecycleMutex.runExclusive(async () => {
        if (address) {
          return address
        }

        const port = options.port ?? await getRandomPort(host)
        server = serve(options.app, { hostname: host, port, silent })

        address = {
          host,
          port,
          baseUrl: `http://${host}:${port}`,
        }

        return address
      })
    },
    async stop(): Promise<void> {
      await lifecycleMutex.runExclusive(async () => {
        address = undefined
        if (!server) {
          return
        }

        const activeServer = server
        server = undefined
        await activeServer.close().catch(() => {})
      })
    },
    getAddress() {
      return address
    },
  }
}
