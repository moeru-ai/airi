import type { CommandLine } from 'electron'

import { env } from 'node:process'

import { isLinux } from 'std-env'

type ConfigurableCommandLine = Pick<CommandLine, 'appendSwitch' | 'getSwitchValue' | 'hasSwitch' | 'removeSwitch'>

/**
 * Adds the Chromium switches that AIRI requires before Electron becomes ready.
 *
 * The function reads the real host platform. Tests must not replace the platform
 * because Chromium selects its backend from the host process at startup.
 */
export function configureAppCommandLine(commandLine: ConfigurableCommandLine): void {
  if (!isLinux)
    return

  const enabledFeatures = new Set(
    commandLine
      .getSwitchValue('enable-features')
      .split(',')
      .map(feature => feature.trim())
      .filter(Boolean),
  )

  // Thanks to [@blurymind](https://github.com/blurymind),
  //
  // When running Electron on Linux, navigator.gpu.requestAdapter() fails.
  // In order to enable WebGPU and process the shaders fast enough, we need the following
  // command line switches to be set.
  //
  // https://github.com/electron/electron/issues/41763#issuecomment-2051725363
  // https://github.com/electron/electron/issues/41763#issuecomment-3143338995
  enabledFeatures.add('SharedArrayBuffer')
  enabledFeatures.add('Vulkan')
  commandLine.appendSwitch('enable-unsafe-webgpu')

  // NOTICE: we need UseOzonePlatform, WaylandWindowDecorations for working on Wayland.
  // Partially related to https://github.com/electron/electron/issues/41551, since X11 is deprecating now,
  // we can safely remove the feature flags for Electron once they made it default supported.
  // Fixes: https://github.com/moeru-ai/airi/issues/757
  // Ref: https://github.com/mmaura/poe2linuxcompanion/blob/90664607a147ea5ccea28df6139bd95fb0ebab0e/electron/main/index.ts#L28-L46
  if (env.XDG_SESSION_TYPE === 'wayland') {
    enabledFeatures.add('GlobalShortcutsPortal')
    enabledFeatures.add('GlobalShortcutsPortalPreferredTrigger')
    enabledFeatures.add('UseOzonePlatform')
    enabledFeatures.add('WaylandWindowDecorations')
  }

  // Chromium keeps one value for each switch. Replace the prior value once
  // so AIRI preserves user features and does not discard its own features.
  if (commandLine.hasSwitch('enable-features'))
    commandLine.removeSwitch('enable-features')
  commandLine.appendSwitch('enable-features', [...enabledFeatures].join(','))
}
