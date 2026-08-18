export type ElectronCallbackParseResult
  = | {
    status: 'ready'
    code: string
    port: string
    state: string
    relayUrl: string
  }
  | {
    status: 'error'
    message: string
  }

export function buildElectronLoopbackUrl(params: {
  code: string
  port: string
  state: string
}) {
  const code = encodeURIComponent(params.code)
  const state = encodeURIComponent(params.state)

  return `http://127.0.0.1:${params.port}/callback?code=${code}&state=${state}`
}

export function parseElectronCallbackQuery(searchParams: URLSearchParams): ElectronCallbackParseResult {
  const error = searchParams.get('error') ?? ''
  const errorDescription = searchParams.get('error_description') ?? ''

  if (error) {
    return {
      message: errorDescription || error,
      status: 'error',
    }
  }

  const code = searchParams.get('code') ?? ''
  const fullState = searchParams.get('state') ?? ''
  const separatorIndex = fullState.indexOf(':')

  if (!code || separatorIndex === -1) {
    return {
      message: 'Invalid state parameter',
      status: 'error',
    }
  }

  const port = fullState.slice(0, separatorIndex)
  const state = fullState.slice(separatorIndex + 1)

  if (!port || !state) {
    return {
      message: 'Invalid state parameter',
      status: 'error',
    }
  }

  return {
    code,
    port,
    relayUrl: buildElectronLoopbackUrl({ code, port, state }),
    state,
    status: 'ready',
  }
}
