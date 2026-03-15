import { describe, expect, it } from 'vitest'

import { appNamesMatch, canonicalizeKnownAppName, findKnownAppMention, getKnownAppLaunchNames, normalizeConfiguredAppAction, resolveConfiguredOpenableApp } from './app-aliases'

describe('app aliases', () => {
  it('matches VS Code aliases to Visual Studio Code', () => {
    expect(appNamesMatch('VS Code', 'Visual Studio Code')).toBe(true)
    expect(appNamesMatch('vscode', 'Visual Studio Code')).toBe(true)
    expect(appNamesMatch('Visual Studio Code for mac', 'Visual Studio Code')).toBe(true)
    expect(canonicalizeKnownAppName('VS Code')).toBe('Visual Studio Code')
    expect(resolveConfiguredOpenableApp('VS Code', ['Finder', 'Visual Studio Code'])).toBe('Visual Studio Code')
    expect(resolveConfiguredOpenableApp('Visual Studio Code for mac', ['Finder', 'Visual Studio Code'])).toBe('Visual Studio Code')
    expect(getKnownAppLaunchNames('VS Code')).toContain('Visual Studio Code for mac')
  })

  it('normalizes open_app actions to the configured canonical app name', () => {
    expect(normalizeConfiguredAppAction({
      kind: 'open_app',
      input: { app: 'VS Code' },
    }, ['Finder', 'Visual Studio Code'])).toEqual({
      kind: 'open_app',
      input: { app: 'Visual Studio Code' },
    })
  })

  it('finds known app mentions in workflow labels', () => {
    expect(findKnownAppMention('Open project in VS Code')).toBe('Visual Studio Code')
    expect(findKnownAppMention('Reveal folder in Finder')).toBe('Finder')
  })
})
