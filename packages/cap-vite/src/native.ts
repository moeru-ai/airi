import type { ViteDevServer } from 'vite'

import process from 'node:process'

import { basename, extname, relative, resolve, sep } from 'node:path'

export type CapacitorPlatform = 'android' | 'ios'

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

export function resolveCapRunArgs(capArgs: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  if (capArgs.length === 0 || hasCapacitorTargetArg(capArgs)) {
    return capArgs
  }

  const [platformArg, ...rest] = capArgs
  const platform = parseCapacitorPlatform(platformArg)
  const target = platform === 'ios'
    ? env.CAPACITOR_DEVICE_ID_IOS
    : platform === 'android'
      ? env.CAPACITOR_DEVICE_ID_ANDROID
      : undefined

  if (!target) {
    return capArgs
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
