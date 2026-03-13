/**
 * AIRI self-controller tools.
 *
 * These tools give AIRI deterministic control over her own UI:
 * navigating to settings, opening specific module pages, and
 * returning to chat. They execute directly in the renderer via
 * an injectable bridge — no CDP or MCP server round-trip.
 *
 * Bridge must be installed by the host app (stage-tamagotchi /
 * stage-web) before tools are used. See `setAiriSelfNavigationBridge`.
 */

import { tool } from '@xsai/tool'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export interface AiriSelfNavigationBridge {
  /** Navigate to a route path (e.g. '/settings', '/chat'). Returns the resolved path. */
  navigateTo: (path: string) => Promise<string> | string
  /** Return the current route path. */
  getCurrentRoute: () => string
}

let bridge: AiriSelfNavigationBridge | undefined

export function setAiriSelfNavigationBridge(b: AiriSelfNavigationBridge) {
  bridge = b
}

export function clearAiriSelfNavigationBridge() {
  bridge = undefined
}

export function hasAiriSelfNavigationBridge(): boolean {
  return bridge !== undefined
}

function requireBridge(): AiriSelfNavigationBridge {
  if (!bridge) {
    throw new Error('AIRI self-navigation bridge is not installed. The host app must call setAiriSelfNavigationBridge() during setup.')
  }
  return bridge
}

// ---------------------------------------------------------------------------
// Known settings module paths
// ---------------------------------------------------------------------------

const KNOWN_SETTINGS_MODULES: Record<string, string> = {
  'consciousness': '/settings/modules/consciousness',
  'hearing': '/settings/modules/hearing',
  'speech': '/settings/modules/speech',
  'vision': '/settings/modules/vision',
  'mcp': '/settings/modules/mcp',
  'discord': '/settings/modules/messaging-discord',
  'messaging-discord': '/settings/modules/messaging-discord',
  'memory-short-term': '/settings/modules/memory-short-term',
  'memory-long-term': '/settings/modules/memory-long-term',
  'beat-sync': '/settings/modules/beat-sync',
  'gaming-minecraft': '/settings/modules/gaming-minecraft',
  'gaming-factorio': '/settings/modules/gaming-factorio',
  'x': '/settings/modules/x',
  // Top-level settings sections
  'models': '/settings/models',
  'connection': '/settings/connection',
  'data': '/settings/data',
  'memory': '/settings/memory',
  'airi-card': '/settings/airi-card',
  'system': '/settings/system',
  'system-general': '/settings/system/general',
  'system-color-scheme': '/settings/system/color-scheme',
  'system-developer': '/settings/system/developer',
}

const KNOWN_MODULE_NAMES = Object.keys(KNOWN_SETTINGS_MODULES).join(', ')
const SETTINGS_ROUTE_PREFIX_RE = /^\/settings(?:\/|$)/u

function resolveSettingsNavigationTarget(module: string): string {
  const trimmed = module.trim()
  if (!trimmed) {
    throw new Error('Settings module must not be empty. Use a known module name or an explicit /settings/... route.')
  }

  if (trimmed.startsWith('/')) {
    if (!SETTINGS_ROUTE_PREFIX_RE.test(trimmed)) {
      throw new Error(`Invalid settings route "${trimmed}". Custom routes must stay under /settings.`)
    }

    return trimmed
  }

  const knownRoute = KNOWN_SETTINGS_MODULES[trimmed]
  if (!knownRoute) {
    throw new Error(`Unknown settings module "${trimmed}". Known modules: ${KNOWN_MODULE_NAMES}.`)
  }

  return knownRoute
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

// TODO: scale this beyond route pushes once AIRI self-tools grow into a fuller
// self-management surface with stronger route/schema integration.
export async function airiSelf() {
  return Promise.all([
    tool({
      name: 'airi_open_settings',
      description: 'Open the AIRI settings page. Returns the current route after navigation.',
      parameters: z.object({}),
      execute: async () => {
        const b = requireBridge()
        const resolved = await b.navigateTo('/settings')
        return [{ type: 'text' as const, text: `Navigated to settings. Current route: ${resolved}` }]
      },
    }),
    tool({
      name: 'airi_open_settings_module',
      description: `Open a specific AIRI settings module page. Known modules: ${KNOWN_MODULE_NAMES}. You can also pass an explicit route path under '/settings/'.`,
      parameters: z.object({
        module: z.string().describe(`Known module name (e.g. 'consciousness', 'discord', 'mcp', 'models') or an explicit route path under '/settings/'`),
      }),
      execute: async ({ module }) => {
        const b = requireBridge()
        const path = resolveSettingsNavigationTarget(module)
        const resolved = await b.navigateTo(path)
        return [{ type: 'text' as const, text: `Navigated to settings module. Current route: ${resolved}` }]
      },
    }),
    tool({
      name: 'airi_return_to_chat',
      description: 'Leave the current page (e.g. settings) and return to the main chat view.',
      parameters: z.object({}),
      execute: async () => {
        const b = requireBridge()
        const resolved = await b.navigateTo('/chat')
        return [{ type: 'text' as const, text: `Returned to chat. Current route: ${resolved}` }]
      },
    }),
  ])
}
