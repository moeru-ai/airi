const VOICEBOX_DEV_PROXY_PATH = '/__voicebox'

function isLoopbackHostname(hostname: string) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
}

/** Routes the local development service through Vite. Production connects to the configured endpoint. */
export function resolveVoiceboxEndpoint(baseUrl: string, path: string, development: boolean, location?: URL): URL {
  const base = new URL(baseUrl)
  if (development && location && (location.protocol === 'http:' || location.protocol === 'https:')
    && isLoopbackHostname(location.hostname) && isLoopbackHostname(base.hostname) && base.port === '17493') {
    return new URL(`${VOICEBOX_DEV_PROXY_PATH}${path}`, location.origin)
  }
  return new URL(path.replace(/^\//, ''), base)
}
