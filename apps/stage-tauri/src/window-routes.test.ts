import { describe, expect, it } from 'vitest'

import { resolveStageTauriWindowRoute } from './window-routes'

describe('resolveStageTauriWindowRoute', () => {
  it('keeps the main window on the character stage', () => {
    expect(resolveStageTauriWindowRoute('', 'main')).toMatchObject({
      kind: 'stage',
      label: 'main',
      route: '/',
      title: 'Character stage',
    })
  })

  it('maps known secondary routes to rendered window shells', () => {
    const cases = [
      ['#/settings', 'settings', 'Settings'],
      ['#/chat', 'chat', 'Chat'],
      ['#/widgets', 'widgets', 'Widgets'],
      ['#/caption', 'caption', 'Caption'],
      ['#/notice/fade-on-hover?id=notice-1', 'notice', 'Notice'],
      ['#/about', 'about', 'About AIRI'],
      ['#/onboarding', 'onboarding', 'Onboarding'],
      ['#/devtools/beat-sync', 'devtools', 'Devtools'],
      ['#/beat-sync', 'beat-sync', 'Beat sync'],
      ['#/inlay', 'inlay', 'Inlay'],
      ['#/dashboard', 'dashboard', 'Dashboard'],
    ] as const

    for (const [hash, label, title] of cases) {
      expect(resolveStageTauriWindowRoute(hash, label)).toMatchObject({
        kind: 'secondary',
        label,
        title,
      })
    }
  })

  it('selects the settings connection QR view for the settings connection route', () => {
    expect(resolveStageTauriWindowRoute('#/settings/connection', 'settings')).toMatchObject({
      kind: 'settings-connection',
      label: 'settings',
      route: '/settings/connection',
      title: 'Connection',
    })
  })

  it('falls back to a secondary shell for unknown non-main routes', () => {
    expect(resolveStageTauriWindowRoute('#/extensions', 'extensions')).toMatchObject({
      kind: 'secondary',
      label: 'extensions',
      route: '/extensions',
      title: 'Extensions',
    })
  })

  it('maps the plugins route to the plugin host window', () => {
    expect(resolveStageTauriWindowRoute('#/plugins/example', 'plugins')).toMatchObject({
      kind: 'secondary',
      label: 'plugins',
      route: '/plugins/example',
      title: 'Plugin Host',
    })
  })
})
