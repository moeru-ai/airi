const DEFAULT_BRIDGE_HOST = '127.0.0.1'
const DEFAULT_BRIDGE_PORT = 8765

export const DEFAULT_BRIDGE_URL = `ws://${DEFAULT_BRIDGE_HOST}:${DEFAULT_BRIDGE_PORT}`

export function resolveBridgeUrl(settings = {}) {
  const rawHost = settings.browserDomBridgeHost
  const host = typeof rawHost === 'string' && rawHost.trim()
    ? rawHost.trim()
    : DEFAULT_BRIDGE_HOST

  const rawPort = settings.browserDomBridgePort
  const parsedPort = typeof rawPort === 'number'
    ? rawPort
    : typeof rawPort === 'string' && rawPort.trim()
      ? Number(rawPort)
      : DEFAULT_BRIDGE_PORT
  const port = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65_535
    ? parsedPort
    : DEFAULT_BRIDGE_PORT

  // URL requires IPv6 literals to be wrapped in square brackets.
  const urlHost = host.includes(':') && !(host.startsWith('[') && host.endsWith(']'))
    ? `[${host}]`
    : host

  try {
    const url = new URL(`ws://${urlHost}:${port}`)
    if (url.protocol !== 'ws:' || !url.hostname || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) {
      return DEFAULT_BRIDGE_URL
    }

    return url.toString().replace(/\/$/, '')
  }
  catch {
    return DEFAULT_BRIDGE_URL
  }
}
