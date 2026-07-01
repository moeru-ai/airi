import type { ViteDevServer } from 'vite'

import process from 'node:process'

import { basename, extname, relative, resolve, sep } from 'node:path'

import { x } from 'tinyexec'

export type CapacitorPlatform = 'android' | 'ios'

interface CapacitorTarget {
  id?: string
}

type ListCapacitorTargets = (platform: CapacitorPlatform) => Promise<readonly CapacitorTarget[]>

const nativeExtensionsByPlatform: Record<CapacitorPlatform, Set<string>> = {
  ios: new Set([
    '.entitlements',
    '.h',
    '.hpp',
    '.m',
    '.mm',
    '.pbxproj',
    '.plist',
    '.storyboard',
    '.strings',
    '.swift',
    '.xcodeproj',
    '.xcconfig',
    '.xcscheme',
    '.xib',
  ]),
  android: new Set([
    '.gradle',
    '.java',
    '.json',
    '.kts',
    '.kt',
    '.properties',
    '.xml',
  ]),
}

const nativeNamesByPlatform: Record<CapacitorPlatform, Set<string>> = {
  ios: new Set([
    'Podfile',
    'Podfile.lock',
    'project.pbxproj',
  ]),
  android: new Set([
    'AndroidManifest.xml',
    'build.gradle',
    'build.gradle.kts',
    'gradle.properties',
    'settings.gradle',
    'settings.gradle.kts',
  ]),
}

const ignoredNames = new Set([
  'capacitor.config.json',
])

const ignoredPathSegments = new Set([
  '.gradle',
  'DerivedData',
  'Pods',
  'build',
  'xcuserdata',
])

const ignoredPathPrefixesByPlatform: Record<CapacitorPlatform, string[][]> = {
  ios: [
    ['App', 'CapApp-SPM'],
  ],
  android: [
    ['app', 'src', 'main', 'assets', 'public'],
    ['app', 'src', 'main', 'assets', 'capacitor.plugins.json'],
    ['app', 'src', 'main', 'res', 'xml', 'config.xml'],
    ['app', 'capacitor.build.gradle'],
    ['capacitor-cordova-android-plugins'],
    ['capacitor.settings.gradle'],
  ],
}

export function parseCapacitorPlatform(value: string | undefined): CapacitorPlatform | null {
  return value === 'android' || value === 'ios' ? value : null
}

export function hasCapacitorTargetArg(capArgs: string[]): boolean {
  return capArgs.some((arg, index) => arg === '--target' || (index > 0 && arg.startsWith('--target=')))
}

function parseCapacitorTargetList(value: string): CapacitorTarget[] {
  const parsed = JSON.parse(value)
  if (!Array.isArray(parsed)) {
    throw new TypeError('Expected `cap run --list --json` to return a JSON array.')
  }

  return parsed
    .filter((target): target is CapacitorTarget => typeof target === 'object' && target !== null && typeof (target as CapacitorTarget).id === 'string')
}

async function listCapacitorTargets(platform: CapacitorPlatform): Promise<CapacitorTarget[]> {
  const output = await x('cap', ['run', platform, '--list', '--json'])

  return parseCapacitorTargetList(output.stdout)
}

/**
 * Resolves Capacitor run arguments by applying target defaults.
 *
 * Use when:
 * - `cap-vite` is about to run `cap run`
 * - Callers want env-based device IDs before falling back to the first available target
 *
 * Expects:
 * - `capArgs[0]` is already validated as `ios` or `android` by the CLI boundary
 * - Explicit `--target` arguments must stay untouched so Capacitor can validate them
 *
 * Returns:
 * - The original args when a target is explicit
 * - Args with `--target` injected from env or the first listed Capacitor target
 */
export async function resolveCapRunArgs(
  capArgs: string[],
  env: NodeJS.ProcessEnv = process.env,
  listTargets: ListCapacitorTargets = listCapacitorTargets,
): Promise<string[]> {
  if (capArgs.length === 0 || hasCapacitorTargetArg(capArgs)) {
    return capArgs
  }

  const [platformArg, ...rest] = capArgs
  const platform = parseCapacitorPlatform(platformArg)
  let target: string | undefined
  if (platform === 'ios') {
    target = env.CAPACITOR_DEVICE_ID_IOS
  }
  else if (platform === 'android') {
    target = env.CAPACITOR_DEVICE_ID_ANDROID
  }

  if (!target) {
    if (!platform) {
      return capArgs
    }

    const targets = await listTargets(platform)
    target = targets.find(device => device.id)?.id
  }

  if (!target) {
    throw new Error(`No ${platform} devices or simulators found. Connect a device, start a simulator or emulator, or pass --target explicitly.`)
  }

  return [platformArg, '--target', target, ...rest]
}

export function pickServerUrl(server: Pick<ViteDevServer, 'resolvedUrls'>): URL {
  const url = server.resolvedUrls?.network?.[0] ?? server.resolvedUrls?.local?.[0]

  if (!url) {
    throw new Error('Vite did not expose a reachable dev server URL.')
  }

  return new URL(url)
}

export function shouldRestartForNativeChange(file: string, platform: CapacitorPlatform, cwd: string): boolean {
  const absoluteFile = resolve(cwd, file)
  const platformRoot = resolve(cwd, platform)

  if (!absoluteFile.startsWith(`${platformRoot}${sep}`) && absoluteFile !== platformRoot) {
    return false
  }

  const fileName = basename(absoluteFile)

  if (ignoredNames.has(fileName)) {
    return false
  }

  const segments = absoluteFile.split(sep)
  if (segments.some(segment => ignoredPathSegments.has(segment))) {
    return false
  }

  const relativeFile = relative(platformRoot, absoluteFile)
  const relativeSegments = relativeFile.split(sep).filter(Boolean)

  if (ignoredPathPrefixesByPlatform[platform].some(prefix =>
    prefix.every((segment, index) => relativeSegments[index] === segment),
  )) {
    // NOTICE: Capacitor regenerates ios/App/CapApp-SPM/Package.swift during `cap run`.
    // It also rewrites several generated Android files and plugin trees during `cap update`.
    // Treating those generated outputs as native source changes causes an infinite restart loop.
    return false
  }

  if (nativeNamesByPlatform[platform].has(fileName)) {
    return true
  }

  return nativeExtensionsByPlatform[platform].has(extname(fileName).toLowerCase())
}
