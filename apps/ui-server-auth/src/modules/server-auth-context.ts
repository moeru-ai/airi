import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'

export interface ServerAuthBootstrapContext {
  apiServerUrl: string
  currentUrl: string
  oidcCallback?: {
    code: string
    error: string
    errorDescription: string
    state: string
  }
}

const SCRIPT_ID = 'airi-server-auth-context'

let cachedContext: ServerAuthBootstrapContext | null | undefined

export function getServerAuthBootstrapContext(): ServerAuthBootstrapContext | null {
  if (cachedContext !== undefined)
    return cachedContext

  const element = document.getElementById(SCRIPT_ID)
  if (!element) {
    cachedContext = null
    return cachedContext
  }

  try {
    const parsed = JSON.parse(element.textContent ?? '') as Partial<ServerAuthBootstrapContext>
    cachedContext = {
      apiServerUrl: parsed.apiServerUrl ?? SERVER_URL,
      currentUrl: parsed.currentUrl ?? window.location.href,
      oidcCallback: parsed.oidcCallback,
    }
    return cachedContext
  }
  catch {
    cachedContext = null
    return cachedContext
  }
}
