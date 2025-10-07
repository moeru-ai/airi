/**
 * Check if we should use the proxy based on environment
 * - In browser (serverless deployment): use proxy
 * - In Tauri/Electron: direct connection
 */
export function shouldUseProxy(): boolean {
  // Check if running in browser (not Tauri/Electron)
  if (typeof window !== 'undefined') {
    // @ts-expect-error - Tauri specific
    const isTauri = window.__TAURI__ !== undefined
    // @ts-expect-error - Electron specific
    const isElectron = (window as any).process?.type === 'renderer'

    return !isTauri && !isElectron
  }

  return false
}

/**
 * Get the proxy endpoint URL
 */
export function getProxyUrl(): string {
  // In production, use relative URL (same origin)
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}/api/llm/proxy`
  }

  // Fallback
  return '/api/llm/proxy'
}

/**
 * Create a proxied fetch function that routes requests through our serverless function
 * This bypasses CORS restrictions when calling third-party LLM APIs from the browser
 */
export function createProxiedFetch(targetBaseURL: string, apiKey?: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Convert input to URL string
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

    // If not using proxy (Tauri/Electron), use normal fetch
    if (!shouldUseProxy()) {
      return fetch(input, init)
    }

    // eslint-disable-next-line no-console
    console.log('[Proxy] Routing request through proxy:', url)

    // Extract relative path from the full URL
    const urlObj = new URL(url, targetBaseURL)
    const relativePath = urlObj.pathname + urlObj.search

    // Create proxy request
    const proxyHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Target-Url': `${targetBaseURL}${relativePath}`,
    }

    if (apiKey) {
      proxyHeaders['X-Api-Key'] = apiKey
    }

    // Forward original headers with x-custom- prefix
    if (init?.headers) {
      const headers = new Headers(init.headers)
      headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'content-type' && key.toLowerCase() !== 'authorization') {
          proxyHeaders[`X-Custom-${key}`] = value
        }
      })
    }

    // Make request through proxy
    const response = await fetch(getProxyUrl(), {
      method: init?.method || 'POST',
      headers: proxyHeaders,
      body: init?.body,
    })

    return response
  }
}
