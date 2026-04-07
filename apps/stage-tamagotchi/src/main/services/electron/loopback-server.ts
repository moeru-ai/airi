import http from 'node:http'

import { useLogg } from '@guiiai/logg'

const log = useLogg('loopback-server').useGlobalConfig()

export interface LoopbackCallbackResult {
  code: string
  state: string
}

/**
 * Fixed ports for the loopback OIDC callback server.
 * The server relay page (`/api/auth/oidc/electron-callback`) forwards the
 * authorization code to `http://127.0.0.1:{port}/callback` via JS fetch().
 * The port is encoded in the `state` parameter, not in the redirect_uri.
 *
 * See RFC 8252 S7.3 for the loopback redirect pattern.
 */
const LOOPBACK_PORTS = [19721, 19722, 19723, 19724, 19725]

/**
 * Start a temporary HTTP server on 127.0.0.1 to receive an OIDC authorization
 * callback. Tries ports from LOOPBACK_PORTS in order. The server handles
 * exactly one request and then shuts down.
 *
 * This follows RFC 8252 S7.3 (Loopback Interface Redirection) and is the
 * approach used by VS Code, GitHub Desktop, and Slack Desktop.
 */
export function startLoopbackServer(): Promise<{
  port: number
  result: Promise<LoopbackCallbackResult>
  close: () => void
}> {
  return new Promise((resolveStart, rejectStart) => {
    let settled = false
    let resultResolve: (value: LoopbackCallbackResult) => void
    let resultReject: (reason: Error) => void

    const resultPromise = new Promise<LoopbackCallbackResult>((resolve, reject) => {
      resultResolve = resolve
      resultReject = reject
    })

    const server = http.createServer((req, res) => {
      if (settled)
        return

      const url = new URL(req.url ?? '/', `http://127.0.0.1`)

      // CORS: the relay page on the server origin sends a cross-origin fetch()
      // to the loopback. Allow all origins since this is a one-shot local server.
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end('Not found')
        return
      }

      const error = url.searchParams.get('error')
      if (error) {
        const description = url.searchParams.get('error_description') ?? error
        settled = true
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>')
        resultReject!(new Error(description))
        server.close()
        return
      }

      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body><h2>Missing parameters</h2></body></html>')
        return
      }

      settled = true
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body><h2>Authentication successful!</h2><p>You can close this window and return to the app.</p></body></html>')
      resultResolve!({ code, state })
      server.close()
    })

    // Safety timeout: close after 5 minutes
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        resultReject!(new Error('Login timed out — no callback received'))
        server.close()
      }
    }, 5 * 60 * 1000)

    server.on('close', () => clearTimeout(timeout))

    // Try each port in order
    let portIndex = 0

    function tryListen(): void {
      if (portIndex >= LOOPBACK_PORTS.length) {
        rejectStart(new Error(`All loopback ports (${LOOPBACK_PORTS.join(', ')}) are in use`))
        return
      }

      const port = LOOPBACK_PORTS[portIndex]

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          log.withFields({ port }).log('Port in use, trying next')
          portIndex++
          tryListen()
        }
        else {
          rejectStart(err)
        }
      })

      server.listen(port, '127.0.0.1', () => {
        log.withFields({ port }).log('Loopback callback server started')
        resolveStart({
          port,
          result: resultPromise,
          close: () => {
            if (settled)
              return

            settled = true
            resultReject!(new Error('OIDC login attempt cancelled'))
            server.close()
          },
        })
      })
    }

    tryListen()
  })
}
