import type { ActionInvocation, BrowserSurfaceAvailability } from '../types'

export type DesktopExecutionMode = 'background' | 'browser_surface' | 'foreground'

export interface DesktopSchedulingDecision {
  executionMode: DesktopExecutionMode
  executionReason: string
  browserSurfacePreferred: boolean
  foregroundRequired: boolean
}

function hasBrowserDomSurface(browserSurface?: BrowserSurfaceAvailability): boolean {
  return Boolean(browserSurface?.availableSurfaces?.some(surface => surface === 'browser_dom' || surface === 'browser_cdp'))
}

function isBackgroundReadAction(action: ActionInvocation): boolean {
  return action.kind === 'observe_windows'
    || action.kind === 'screenshot'
    || action.kind === 'wait'
    || action.kind === 'clipboard_read_text'
    || action.kind === 'clipboard_write_text'
    || action.kind === 'secret_read_env_value'
}

function isBrowserDomCapableAction(action: ActionInvocation): boolean {
  return action.kind === 'desktop_click_target'
}

function isNativeForegroundAction(action: ActionInvocation): boolean {
  return action.kind === 'click'
    || action.kind === 'press_keys'
    || action.kind === 'scroll'
    || action.kind === 'open_app'
    || action.kind === 'focus_app'
    || action.kind === 'terminal_exec'
    || action.kind === 'terminal_reset'
}

export function decideDesktopExecutionMode(params: {
  action: ActionInvocation
  browserSurface?: BrowserSurfaceAvailability
  browserDomRoute?: boolean
}): DesktopSchedulingDecision {
  const { action, browserSurface, browserDomRoute } = params
  const browserSurfaceAvailable = hasBrowserDomSurface(browserSurface)

  if (action.kind === 'desktop_observe') {
    if (action.input?.includeChrome === false) {
      return {
        executionMode: 'background',
        executionReason: 'desktop_observe is background-only when Chrome capture is disabled',
        browserSurfacePreferred: false,
        foregroundRequired: false,
      }
    }

    if (browserSurfaceAvailable) {
      return {
        executionMode: 'browser_surface',
        executionReason: 'browser surface is available, so desktop_observe can collect Chrome semantics without a foreground switch',
        browserSurfacePreferred: true,
        foregroundRequired: false,
      }
    }

    return {
      executionMode: 'background',
      executionReason: 'desktop_observe stays background-only because no browser surface is available',
      browserSurfacePreferred: false,
      foregroundRequired: false,
    }
  }

  if (isBackgroundReadAction(action)) {
    return {
      executionMode: 'background',
      executionReason: `${action.kind} is read-only and does not need foreground switching`,
      browserSurfacePreferred: false,
      foregroundRequired: false,
    }
  }

  if (isBrowserDomCapableAction(action)) {
    if (browserDomRoute) {
      return {
        executionMode: 'browser_surface',
        executionReason: 'browser_dom route is available, so click_target can stay background-safe',
        browserSurfacePreferred: true,
        foregroundRequired: false,
      }
    }

    return {
      executionMode: 'foreground',
      executionReason: browserSurfaceAvailable
        ? 'desktop_click_target needs foreground because browser_dom is unavailable for this candidate'
        : 'desktop_click_target needs foreground because no browser surface is available',
      browserSurfacePreferred: false,
      foregroundRequired: true,
    }
  }

  if (isNativeForegroundAction(action)) {
    return {
      executionMode: 'foreground',
      executionReason: `${action.kind} uses native input and needs foreground access`,
      browserSurfacePreferred: false,
      foregroundRequired: true,
    }
  }

  return {
    executionMode: 'foreground',
    executionReason: `defaulting ${action.kind} to foreground execution`,
    browserSurfacePreferred: false,
    foregroundRequired: true,
  }
}
