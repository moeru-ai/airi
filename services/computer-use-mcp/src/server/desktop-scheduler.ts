import type { ActionInvocation, BrowserSurfaceAvailability } from '../types'

export type DesktopExecutionMode = 'background' | 'browser_surface' | 'foreground'

export interface DesktopSchedulingDecision {
  browserSurfacePreferred: boolean
  executionMode: DesktopExecutionMode
  executionReason: string
  foregroundRequired: boolean
}

export function decideDesktopExecutionMode(params: {
  action: ActionInvocation
  browserDomRoute?: boolean
  browserSurface?: BrowserSurfaceAvailability
}): DesktopSchedulingDecision {
  const { action, browserDomRoute, browserSurface } = params
  const browserSurfaceAvailable = hasBrowserDomSurface(browserSurface)

  if (action.kind === 'desktop_observe') {
    if (action.input?.includeChrome === false) {
      return {
        browserSurfacePreferred: false,
        executionMode: 'background',
        executionReason: 'desktop_observe is background-only when Chrome capture is disabled',
        foregroundRequired: false,
      }
    }

    if (browserSurfaceAvailable) {
      return {
        browserSurfacePreferred: true,
        executionMode: 'browser_surface',
        executionReason: 'browser surface is available, so desktop_observe can collect Chrome semantics without a foreground switch',
        foregroundRequired: false,
      }
    }

    return {
      browserSurfacePreferred: false,
      executionMode: 'background',
      executionReason: 'desktop_observe stays background-only because no browser surface is available',
      foregroundRequired: false,
    }
  }

  if (isBackgroundReadAction(action)) {
    return {
      browserSurfacePreferred: false,
      executionMode: 'background',
      executionReason: `${action.kind} is read-only and does not need foreground switching`,
      foregroundRequired: false,
    }
  }

  if (isBrowserDomCapableAction(action)) {
    if (browserDomRoute) {
      return {
        browserSurfacePreferred: true,
        executionMode: 'browser_surface',
        executionReason: 'browser_dom route is available, so click_target can stay background-safe',
        foregroundRequired: false,
      }
    }

    return {
      browserSurfacePreferred: false,
      executionMode: 'foreground',
      executionReason: browserSurfaceAvailable
        ? 'desktop_click_target needs foreground because browser_dom is unavailable for this candidate'
        : 'desktop_click_target needs foreground because no browser surface is available',
      foregroundRequired: true,
    }
  }

  if (isNativeForegroundAction(action)) {
    return {
      browserSurfacePreferred: false,
      executionMode: 'foreground',
      executionReason: `${action.kind} uses native input and needs foreground access`,
      foregroundRequired: true,
    }
  }

  return {
    browserSurfacePreferred: false,
    executionMode: 'foreground',
    executionReason: `defaulting ${action.kind} to foreground execution`,
    foregroundRequired: true,
  }
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
