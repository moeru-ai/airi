import { errorMessageFrom } from '@moeru/std'
import { isElectronWindow } from '@proj-airi/stage-shared'

import { SERVER_URL } from '../libs/server'

const SINGING_LOCAL_BASE_URL_STORAGE_KEY = 'singing/local-base-url'
const isElectron = typeof import.meta.env.RUNTIME_ENVIRONMENT === 'string'
  && import.meta.env.RUNTIME_ENVIRONMENT === 'electron'

export interface SingingLocalServerInfo {
  url: string | null
  port: number | null
  ready: boolean
  error?: string
}

interface SingingElectronApi {
  singing?: {
    getLocalServerInfo?: () => Promise<SingingLocalServerInfo>
  }
}

let cachedElectronSingingBaseUrl: string | null = null
let pendingElectronBaseUrl: Promise<string> | null = null
let electronBaseUrlResolvedFromMain = false

function getServerSingingBaseUrl(): string {
  return `${SERVER_URL}/api/v1/singing`
}

function readCachedElectronSingingBaseUrl(): string | null {
  if (cachedElectronSingingBaseUrl)
    return cachedElectronSingingBaseUrl

  if (typeof window === 'undefined')
    return null

  const persisted = window.localStorage.getItem(SINGING_LOCAL_BASE_URL_STORAGE_KEY)
  if (!persisted)
    return null

  cachedElectronSingingBaseUrl = persisted
  return persisted
}

function cacheElectronSingingBaseUrl(url: string): string {
  cachedElectronSingingBaseUrl = url

  if (typeof window !== 'undefined')
    window.localStorage.setItem(SINGING_LOCAL_BASE_URL_STORAGE_KEY, url)

  return url
}

function clearCachedElectronSingingBaseUrl(): void {
  cachedElectronSingingBaseUrl = null

  if (typeof window !== 'undefined')
    window.localStorage.removeItem(SINGING_LOCAL_BASE_URL_STORAGE_KEY)
}

export async function resolveElectronSingingBaseUrlFromApi(api: SingingElectronApi['singing']): Promise<string> {
  if (!api?.getLocalServerInfo)
    throw new Error('Electron singing runtime bridge is unavailable')

  const serverInfo = await api.getLocalServerInfo()
  if (!serverInfo.ready || !serverInfo.url) {
    clearCachedElectronSingingBaseUrl()
    throw new Error(serverInfo.error ?? 'Local singing server is unavailable')
  }

  electronBaseUrlResolvedFromMain = true
  return cacheElectronSingingBaseUrl(serverInfo.url)
}

async function resolveSingingBaseUrl(): Promise<string> {
  if (!isElectron)
    return getServerSingingBaseUrl()

  if (electronBaseUrlResolvedFromMain) {
    const cachedUrl = readCachedElectronSingingBaseUrl()
    if (cachedUrl)
      return cachedUrl
  }

  if (!pendingElectronBaseUrl) {
    pendingElectronBaseUrl = (async () => {
      if (typeof window === 'undefined' || !isElectronWindow<SingingElectronApi>(window))
        throw new Error('Electron singing runtime bridge is unavailable')

      return await resolveElectronSingingBaseUrlFromApi(window.api?.singing)
    })()
      .finally(() => {
        pendingElectronBaseUrl = null
      })
  }

  return await pendingElectronBaseUrl
}

function getKnownSingingBaseUrl(): string {
  if (!isElectron)
    return getServerSingingBaseUrl()

  return readCachedElectronSingingBaseUrl() ?? ''
}

export function useSingingApi() {
  void resolveSingingBaseUrl().catch(() => {})

  function apiUrl(path: string): string {
    return `${getKnownSingingBaseUrl()}${path}`
  }

  async function singingFetch(path: string, init?: RequestInit): Promise<Response> {
    const baseUrl = await resolveSingingBaseUrl()
    const url = `${baseUrl}${path}`
    const options: RequestInit = { ...init }

    if (!isElectron) {
      options.credentials = 'include'
    }

    try {
      return await fetch(url, options)
    }
    catch (error) {
      throw new Error(errorMessageFrom(error) ?? 'Failed to reach singing service')
    }
  }

  return {
    singingBaseUrl: getKnownSingingBaseUrl(),
    apiUrl,
    singingFetch,
  }
}
