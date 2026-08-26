import type { ActionInvocation } from './types'

interface KnownAppDefinition {
  aliases: string[]
  canonical: string
  launchNames?: string[]
}

const knownApps: KnownAppDefinition[] = [
  { aliases: ['finder'], canonical: 'Finder' },
  { aliases: ['terminal', 'terminal.app'], canonical: 'Terminal' },
  { aliases: ['cursor'], canonical: 'Cursor' },
  {
    aliases: ['visual studio code', 'visual studio code for mac', 'vs code', 'vscode', 'code'],
    canonical: 'Visual Studio Code',
    launchNames: ['Visual Studio Code', 'Visual Studio Code for mac'],
  },
  { aliases: ['google chrome', 'chrome'], canonical: 'Google Chrome' },
  { aliases: ['electron'], canonical: 'Electron' },
]

const APP_SUFFIX_RE = /\.app$/u
const WHITESPACE_RE = /\s+/gu

export function appNamesMatch(left: string | undefined, right: string | undefined) {
  if (!left || !right) {
    return false
  }

  const leftKey = normalizeAppNameKey(left)
  const rightKey = normalizeAppNameKey(right)
  if (leftKey === rightKey) {
    return true
  }

  const leftCanonical = canonicalizeKnownAppName(left)
  const rightCanonical = canonicalizeKnownAppName(right)
  return normalizeAppNameKey(leftCanonical) === normalizeAppNameKey(rightCanonical)
}

export function canonicalizeKnownAppName(value: string) {
  return getCanonicalKnownAppName(value) ?? value.trim()
}

export function findKnownAppMention(text: string) {
  const normalized = normalizeAppNameKey(text)
  const match = knownApps.find(app => app.aliases.some(alias => normalized.includes(normalizeAppNameKey(alias))))
  return match?.canonical
}

export function getKnownAppLaunchNames(value: string) {
  const definition = getKnownAppDefinition(value)
  if (!definition) {
    return [value.trim()]
  }

  return Array.from(new Set([definition.canonical, ...(definition.launchNames ?? []), value.trim()]))
}

export function normalizeConfiguredAppAction(action: ActionInvocation, openableApps: string[]): ActionInvocation {
  if (action.kind !== 'open_app' && action.kind !== 'focus_app') {
    return action
  }

  const resolvedApp = resolveConfiguredOpenableApp(action.input.app, openableApps)
  if (!resolvedApp) {
    return action
  }

  return {
    ...action,
    input: {
      ...action.input,
      app: resolvedApp,
    },
  }
}

export function resolveConfiguredOpenableApp(requested: string, openableApps: string[]) {
  return openableApps.find(candidate => appNamesMatch(candidate, requested))
}

function getCanonicalKnownAppName(value: string) {
  const requestedKey = normalizeAppNameKey(value)
  const match = knownApps.find(app => app.aliases.some(alias => normalizeAppNameKey(alias) === requestedKey))
  return match?.canonical
}

function getKnownAppDefinition(value: string) {
  const requestedKey = normalizeAppNameKey(value)
  return knownApps.find((app) => {
    const candidates = [app.canonical, ...app.aliases, ...(app.launchNames ?? [])]
    return candidates.some(candidate => normalizeAppNameKey(candidate) === requestedKey)
  })
}

function normalizeAppNameKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(APP_SUFFIX_RE, '')
    .replace(WHITESPACE_RE, ' ')
}
