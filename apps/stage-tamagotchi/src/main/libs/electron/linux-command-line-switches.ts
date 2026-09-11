/**
 * Chromium command-line switches this app needs on Linux, split by how
 * confidently we can apply them:
 *
 * - `base` switches are safe under both X11 and (X)Wayland sessions. They
 *   enable WebGPU/Vulkan, which Electron does not turn on by default on
 *   Linux.
 *   https://github.com/electron/electron/issues/41763#issuecomment-2051725363
 * - `wayland` switches only make sense when the session is actually
 *   Wayland. They select Electron's Ozone/Wayland backend instead of the
 *   default XWayland fallback, and ask the compositor for window
 *   decorations and the global-shortcuts portal.
 *   Fixes: https://github.com/moeru-ai/airi/issues/757
 *   Ref: https://github.com/mmaura/poe2linuxcompanion/blob/90664607a147ea5ccea28df6139bd95fb0ebab0e/electron/main/index.ts#L28-L46
 *
 * Kept as data (name/value pairs) rather than direct
 * `app.commandLine.appendSwitch` calls so the session-type branching can be
 * unit tested without an Electron runtime or a real display server.
 */
export interface CommandLineSwitch {
  name: string
  value: string
}

export interface LinuxSessionEnv {
  XDG_SESSION_TYPE?: string
}

export function isWaylandSession(env: LinuxSessionEnv): boolean {
  return env.XDG_SESSION_TYPE === 'wayland'
}

export function resolveLinuxCommandLineSwitches(env: LinuxSessionEnv): CommandLineSwitch[] {
  const switches: CommandLineSwitch[] = [
    { name: 'enable-features', value: 'SharedArrayBuffer' },
    { name: 'enable-unsafe-webgpu', value: '' },
    { name: 'enable-features', value: 'Vulkan' },
  ]

  if (isWaylandSession(env)) {
    switches.push(
      { name: 'enable-features', value: 'GlobalShortcutsPortal' },
      { name: 'enable-features', value: 'UseOzonePlatform' },
      { name: 'enable-features', value: 'WaylandWindowDecorations' },
    )
  }

  return switches
}
