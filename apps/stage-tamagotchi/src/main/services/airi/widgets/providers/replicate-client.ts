import Replicate from 'replicate'

import { fetchAI } from '../../../electron/ai-transport'

/** Keeps SDK prediction polling while sending each HTTP request exactly once. */
export class ReplicateClient extends Replicate {
  override async request(route: string | URL, options: Parameters<Replicate['request']>[1]): Promise<Response> {
    const baseUrl = this.baseUrl ?? 'https://api.replicate.com/v1'
    const url = route instanceof URL ? new URL(route) : new URL(route.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`)
    if (options.params) {
      for (const [key, value] of Object.entries(options.params))
        url.searchParams.append(key, String(value))
    }
    const headers = new Headers(options.headers as HeadersInit | undefined)
    if (this.auth)
      headers.set('authorization', `Bearer ${this.auth}`)
    let body: BodyInit | undefined
    if (options.data instanceof FormData) {
      body = options.data
    }
    else if (options.data) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(options.data)
    }
    // NOTICE:
    // Replicate retries failed POST requests, including network failures and HTTP 429.
    // Its request method has no option to disable these retries.
    // Source: replicate/index.js request and replicate/lib/util.js withAutomaticRetries.
    // Remove this override when the SDK exposes an explicit no-retry option.
    const response = await fetchAI(url, { method: options.method ?? 'GET', headers, body, signal: options.signal })
    if (!response.ok) {
      const error = new Error(`Replicate request failed: HTTP ${response.status}`)
      throw Object.assign(error, { response })
    }
    return response
  }
}
