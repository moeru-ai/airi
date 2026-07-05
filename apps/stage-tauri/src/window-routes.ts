export interface StageTauriWindowRoute {
  kind: 'stage' | 'secondary' | 'settings-connection'
  label: string
  route: string
  title: string
}

const routeTitles: Record<string, string> = {
  about: 'About AIRI',
  'beat-sync': 'Beat sync',
  caption: 'Caption',
  chat: 'Chat',
  dashboard: 'Dashboard',
  devtools: 'Devtools',
  inlay: 'Inlay',
  notice: 'Notice',
  onboarding: 'Onboarding',
  plugins: 'Plugin Host',
  settings: 'Settings',
  widgets: 'Widgets',
}

function normalizeHashRoute(hash: string): string {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash
  const route = withoutHash || '/'
  return route.startsWith('/') ? route : `/${route}`
}

function titleFromLabel(label: string): string {
  if (routeTitles[label]) return routeTitles[label]

  return (
    label
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ') || 'Window'
  )
}

export function resolveStageTauriWindowRoute(hash = '', label = 'main'): StageTauriWindowRoute {
  const route = normalizeHashRoute(hash)
  if (label === 'main' && route === '/') {
    return {
      kind: 'stage',
      label,
      route,
      title: 'Character stage',
    }
  }

  if (route === '/settings/connection') {
    return {
      kind: 'settings-connection',
      label,
      route,
      title: 'Connection',
    }
  }

  const routeKey = route.split(/[/?#]/).find(Boolean) ?? label

  return {
    kind: 'secondary',
    label,
    route,
    title: titleFromLabel(routeKey),
  }
}
