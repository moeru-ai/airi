import { SERVER_URL } from '../libs/server'

const SINGING_LOCAL_PORT = 26121
const isElectron = typeof import.meta.env.RUNTIME_ENVIRONMENT === 'string'
  && import.meta.env.RUNTIME_ENVIRONMENT === 'electron'

const singingBaseUrl = isElectron
  ? `http://127.0.0.1:${SINGING_LOCAL_PORT}`
  : `${SERVER_URL}/api/v1/singing`

export function useSingingApi() {
  function apiUrl(path: string): string {
    return `${singingBaseUrl}${path}`
  }

  async function singingFetch(path: string, init?: RequestInit): Promise<Response> {
    const url = apiUrl(path)
    const options: RequestInit = { ...init }

    if (!isElectron) {
      options.credentials = 'include'
    }

    return fetch(url, options)
  }

  return {
    singingBaseUrl,
    apiUrl,
    singingFetch,
  }
}
