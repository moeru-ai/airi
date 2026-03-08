import type { Result } from 'tinyexec'
import type { ViteDevServer } from 'vite'

import process from 'node:process'

import { basename, extname, relative, resolve, sep } from 'node:path'

import { x } from 'tinyexec'
import { createServer } from 'vite'

export type CapacitorPlatform = 'android' | 'ios'

export interface RunCapViteOptions {
  cwd?: string
  debounceMs?: number
}

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
  android: [],
}

function pickServerUrl(server: ViteDevServer): URL {
  const url = server.resolvedUrls?.network?.[0] ?? server.resolvedUrls?.local?.[0]

  if (!url) {
    throw new Error('Vite did not expose a reachable dev server URL.')
  }

  const resolved = new URL(url)

  return resolved
}

function shouldRestartForNativeChange(file: string, platform: CapacitorPlatform, cwd: string): boolean {
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
    // Treating that generated tree as a native source change causes an infinite restart loop.
    return false
  }

  if (nativeNamesByPlatform[platform].has(fileName)) {
    return true
  }

  return nativeExtensionsByPlatform[platform].has(extname(fileName).toLowerCase())
}

async function stopCapProcess(current: Result | undefined) {
  if (!current) {
    return
  }

  current.kill('SIGINT')

  try {
    await current
  }
  catch {
    // tinyexec rejects on interrupted exits when the child was stopped for a restart.
  }
}

function startCapProcess(cwd: string, platform: CapacitorPlatform, deviceId: string, url: URL) {
  return x('cap', ['run', platform, '--target', deviceId], { persist: true, throwOnError: false, nodeOptions: { cwd, stdio: 'inherit', env: { CAPACITOR_DEV_SERVER_URL: url.toString() } } })
}

export async function runCapVite(
  platform: CapacitorPlatform,
  deviceId: string,
  options: RunCapViteOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd())
  const debounceMs = options.debounceMs ?? 300
  const server = await createServer({
    clearScreen: false,
    root: cwd,
  })

  await server.listen()
  server.printUrls()

  const url = pickServerUrl(server)
  const logger = server.config.logger

  let currentCapProcess: Result | undefined = startCapProcess(cwd, platform, deviceId, url)
  let restartTimer: NodeJS.Timeout | undefined
  let shuttingDown = false

  async function restartCapProcess(reason: string) {
    if (shuttingDown) {
      return
    }

    logger.info(`[cap-vite] ${reason}. Re-running cap run ${platform}.`)
    const previous = currentCapProcess
    currentCapProcess = undefined
    await stopCapProcess(previous)
    currentCapProcess = startCapProcess(cwd, platform, deviceId, url)
  }

  const onWatcherEvent = (_event: string, file: string) => {
    if (!shouldRestartForNativeChange(file, platform, cwd)) {
      return
    }

    clearTimeout(restartTimer)
    restartTimer = setTimeout(() => {
      void restartCapProcess(`native file changed: ${resolve(cwd, file)}`)
    }, debounceMs)
  }

  const shutdown = async (exitCode: number) => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    clearTimeout(restartTimer)
    server.watcher.off('all', onWatcherEvent)
    await server.watcher.unwatch(platform)
    await server.close()
    await stopCapProcess(currentCapProcess)
    process.exit(exitCode)
  }

  server.watcher.add(platform)
  server.watcher.on('all', onWatcherEvent)

  process.once('SIGINT', () => {
    void shutdown(0)
  })
  process.once('SIGTERM', () => {
    void shutdown(0)
  })
}
