export interface ServerAdminBootstrapContext {
  apiServerUrl: string
  currentUrl: string
}

const SCRIPT_ID = 'airi-server-admin-context'

let cachedContext: ServerAdminBootstrapContext | null | undefined

export function getServerAdminBootstrapContext(): ServerAdminBootstrapContext | null {
  if (cachedContext !== undefined)
    return cachedContext

  const element = document.getElementById(SCRIPT_ID)
  if (!element) {
    cachedContext = null
    return cachedContext
  }

  try {
    const parsed = JSON.parse(element.textContent ?? '') as Partial<ServerAdminBootstrapContext>
    cachedContext = {
      apiServerUrl: parsed.apiServerUrl ?? defaultApiServerUrl(),
      currentUrl: parsed.currentUrl ?? window.location.href,
    }
    return cachedContext
  }
  catch {
    cachedContext = null
    return cachedContext
  }
}

export function defaultApiServerUrl(): string {
  return import.meta.env.VITE_SERVER_URL || window.location.origin
}
