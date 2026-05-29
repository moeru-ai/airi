import { eventHandler, getQuery, H3, handleCors } from 'h3'

import { createH3Server } from '../../server'

export interface LoopbackCallbackResult {
  code: string
  state: string
}

/**
 * Starts a temporary loopback callback server for the Electron OIDC flow.
 *
 * Use when:
 * - Exchanging authorization code from system browser callback
 *
 * Expects:
 * - Callback request on `GET /callback?code=...&state=...`
 * - One-shot lifecycle; first successful callback closes the server
 *
 * Returns:
 * - Random bound port, callback result promise, and manual cancellation method
 */
export async function startLoopbackServer(): Promise<{
  port: number
  result: Promise<LoopbackCallbackResult>
  close: () => void
}> {
  const host = '127.0.0.1'
  let settled = false
  let timeout: ReturnType<typeof setTimeout> | undefined

  let resolveResult!: (value: LoopbackCallbackResult) => void
  let rejectResult!: (reason: Error) => void

  const result = new Promise<LoopbackCallbackResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  const app = new H3()
  const loopbackServer = createH3Server({ app, host })
  const corsOptions = {
    origin: '*',
    methods: '*',
    preflight: {
      statusCode: 204,
    },
  } as const

  const finish = (callback: () => void) => {
    if (settled) {
      return
    }

    settled = true
    if (timeout) {
      clearTimeout(timeout)
      timeout = undefined
    }
    callback()
    void loopbackServer.stop()
  }

  app.options('/callback', eventHandler(async (event) => {
    const corsResponse = handleCors(event, corsOptions)
    if (corsResponse !== false) {
      return corsResponse
    }

    return new Response(null, { status: 204 })
  }))

  app.get('/callback', eventHandler(async (event) => {
    const corsResponse = handleCors(event, corsOptions)
    if (corsResponse !== false) {
      return corsResponse
    }

    const query = getQuery(event)
    const error = typeof query.error === 'string' ? query.error : undefined
    if (error) {
      const description = typeof query.error_description === 'string' && query.error_description.length > 0
        ? query.error_description
        : error
      finish(() => {
        rejectResult(new Error(description))
      })
      return new Response('<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const code = typeof query.code === 'string' ? query.code : ''
    const state = typeof query.state === 'string' ? query.state : ''

    if (!code || !state) {
      return new Response('<html><body><h2>Missing parameters</h2></body></html>', {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    finish(() => {
      resolveResult({ code, state })
    })

    return new Response('<html><body><h2>Authentication successful!</h2><p>You can close this window and return to the app.</p></body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }))

  const address = await loopbackServer.start()

  timeout = setTimeout(() => {
    finish(() => {
      rejectResult(new Error('Sign-in timed out — no callback received'))
    })
  }, 5 * 60 * 1000)

  return {
    port: address.port,
    result,
    close: () => {
      finish(() => {
        rejectResult(new Error('OIDC sign-in attempt cancelled'))
      })
    },
  }
}
