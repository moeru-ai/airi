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
    start(): Promise<BuiltInServerAddress> {
      return lifecycleMutex.runExclusive(() => {
        if (address) {
          return Promise.resolve(address)
        }

        return getRandomPort(host).then((port) => {
          server = serve(options.app, { hostname: host, port, silent })

          address = {
            host,
            port,
            baseUrl: `http://${host}:${port}`,
          }

          return address
        })
      })
    },
    stop(): Promise<void> {
      return lifecycleMutex.runExclusive(() => {
        address = undefined
        if (!server) {
          return
        }

        const activeServer = server
        server = undefined
        return activeServer.close().catch(() => {
          /* noop — ignore close errors */
        })
      })
    },
    getAddress() {
      return address
    },
  }
}
