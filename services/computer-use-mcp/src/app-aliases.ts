import type { ActionInvocation } from './types'

interface KnownAppDefinition {
  canonical: string
  aliases: string[]
  launchNames?: string[]
}

const knownApps: KnownAppDefinition[] = [
  { canonical: 'Finder', aliases: ['finder'] },
  { canonical: 'Terminal', aliases: ['terminal', 'terminal.app'] },
  { canonical: 'Cursor', aliases: ['cursor'] },
  {
    canonical: 'Visual Studio Code',
    aliases: ['visual studio code', 'visual studio code for mac', 'vs code', 'vscode', 'code'],
    launchNames: ['Visual Studio Code', 'Visual Studio Code for mac'],
  },
  { canonical: 'Google Chrome', aliases: ['google chrome', 'chrome'] },
  { canonical: 'Electron', aliases: ['electron'] },
]

function normalizeAppNameKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.app$/u, '')
    .replace(/\s+/gu, ' ')
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

export function canonicalizeKnownAppName(value: string) {
  return getCanonicalKnownAppName(value) ?? value.trim()
}

export function getKnownAppLaunchNames(value: string) {
  const definition = getKnownAppDefinition(value)
  if (!definition) {
    return [value.trim()]
  }

  return Array.from(new Set([definition.canonical, ...(definition.launchNames ?? []), value.trim()]))
}

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

export function resolveConfiguredOpenableApp(requested: string, openableApps: string[]) {
  return openableApps.find(candidate => appNamesMatch(candidate, requested))
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

export function findKnownAppMention(text: string) {
  const normalized = normalizeAppNameKey(text)
  const match = knownApps.find(app => app.aliases.some(alias => normalized.includes(normalizeAppNameKey(alias))))
  return match?.canonical
}
