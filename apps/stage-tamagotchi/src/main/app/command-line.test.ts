import type { CommandLine } from 'electron'

import process from 'node:process'

import { describe, expect, it, vi } from 'vitest'

import { configureAppCommandLine } from './command-line'

type ConfigurableCommandLine = Pick<CommandLine, 'appendSwitch' | 'getSwitchValue' | 'hasSwitch' | 'removeSwitch'>

function createCommandLine(initialFeatures: string): {
  commandLine: ConfigurableCommandLine
  appendSwitch: ReturnType<typeof vi.fn>
} {
  const switches = new Map<string, string>([['enable-features', initialFeatures]])
  const appendSwitch = vi.fn((name: string, value = '') => {
    // Chromium stores one current value for each switch key. A later append
    // replaces the value that getSwitchValue returns to AIRI services.
    switches.set(name, value)
  })

  return {
    appendSwitch,
    commandLine: {
      appendSwitch,
      getSwitchValue: name => switches.get(name) ?? '',
      hasSwitch: name => switches.has(name),
      removeSwitch: name => switches.delete(name),
    },
  }
}

describe.runIf(process.platform === 'linux')('configureAppCommandLine on the Linux host', () => {
  it('preserves user features and writes one combined enable-features switch', () => {
    // ROOT CAUSE:
    //
    // Chromium stores switches by key. AIRI appends `enable-features` once
    // for each feature, so every append replaces the value from the prior
    // append. Screen-capture initialization then preserves only that final
    // value and permanently removes the other Linux startup features.
    //
    // Before the fix, X11 keeps only `Vulkan`. Native Wayland keeps only
    // `WaylandWindowDecorations`.
    //
    // The fix must read the existing value and append one deduplicated list.
    const { appendSwitch, commandLine } = createCommandLine('UserProvidedFeature')

    configureAppCommandLine(commandLine)

    const featureCalls = appendSwitch.mock.calls.filter(([name]) => name === 'enable-features')
    const enabledFeatures = commandLine.getSwitchValue('enable-features').split(',')

    expect(featureCalls).toHaveLength(1)
    expect(enabledFeatures).toContain('UserProvidedFeature')
    expect(enabledFeatures).toContain('SharedArrayBuffer')
    expect(enabledFeatures).toContain('Vulkan')

    if (process.env.XDG_SESSION_TYPE === 'wayland') {
      expect(enabledFeatures).toContain('GlobalShortcutsPortal')
      expect(enabledFeatures).toContain('GlobalShortcutsPortalPreferredTrigger')
      expect(enabledFeatures).toContain('UseOzonePlatform')
      expect(enabledFeatures).toContain('WaylandWindowDecorations')
    }
  })

  it('adds the standalone WebGPU switch once', () => {
    const { appendSwitch, commandLine } = createCommandLine('UserProvidedFeature')

    configureAppCommandLine(commandLine)

    expect(appendSwitch).toHaveBeenCalledWith('enable-unsafe-webgpu')
    expect(appendSwitch.mock.calls.filter(([name]) => name === 'enable-unsafe-webgpu')).toHaveLength(1)
  })
})
