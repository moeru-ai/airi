import type { Signals } from 'node:process'

import type { TimedProcessResult } from './process-group'

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { execFile as execFileCallback, spawn } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { errorMessageFrom } from '@moeru/std'
import { cac } from 'cac'

import { runTimedProcess } from './process-group'

const execFile = promisify(execFileCallback)

type ReleaseArchitecture = 'x64' | 'arm64'

interface PackageEntry {
  path: string
  mode: string
}

interface DebPackageInspection {
  packageName: string
  architecture: string
  entries: PackageEntry[]
}

interface RpmPackageInspection {
  packageName: string
  architecture: string
  scripts: string
  entries: PackageEntry[]
}

interface FlatpakPackageInspection {
  appId: string
  architecture: string
  runtime: string
  command: string
  entries: PackageEntry[]
}

type LaunchSmokeResult = TimedProcessResult

function isRegularFile(entry: PackageEntry): boolean {
  if (entry.mode.startsWith('-'))
    return true

  const numericMode = Number.parseInt(entry.mode, 8)
  return Number.isFinite(numericMode) && (numericMode & 0o170000) === 0o100000
}

function isExecutable(entry: PackageEntry): boolean {
  if (entry.mode.startsWith('-'))
    return entry.mode.includes('x')

  const numericMode = Number.parseInt(entry.mode, 8)
  return Number.isFinite(numericMode) && (numericMode & 0o111) !== 0
}

function findForeignNativePayload(entries: PackageEntry[], releaseArchitecture: ReleaseArchitecture): string | undefined {
  const expectedSlashTarget = `linux/${releaseArchitecture}/`
  const expectedHyphenTarget = `linux-${releaseArchitecture}/`

  return entries.find((entry) => {
    if (!isRegularFile(entry))
      return false

    const path = entry.path

    const onnxRoot = '/onnxruntime-node/bin/napi-v3/'
    const onnxRootIndex = path.indexOf(onnxRoot)
    if (onnxRootIndex !== -1)
      return !path.slice(onnxRootIndex + onnxRoot.length).startsWith(expectedSlashTarget)

    const prebuildRoot = '/uiohook-napi/prebuilds/'
    const prebuildRootIndex = path.indexOf(prebuildRoot)
    if (prebuildRootIndex !== -1)
      return !path.slice(prebuildRootIndex + prebuildRoot.length).startsWith(expectedHyphenTarget)

    const dragRoot = '/electron-click-drag-plugin/build/Release/'
    const dragRootIndex = path.indexOf(dragRoot)
    if (dragRootIndex !== -1)
      return !path.slice(dragRootIndex + dragRoot.length).startsWith(expectedHyphenTarget)

    const imagePackageRoot = '/node_modules/@img/'
    const imagePackageRootIndex = path.indexOf(imagePackageRoot)
    if (imagePackageRootIndex === -1)
      return false

    const packageName = path.slice(imagePackageRootIndex + imagePackageRoot.length).split('/')[0]
    if (!packageName.startsWith('sharp-') && !packageName.startsWith('sharp-libvips-'))
      return false

    return !packageName.endsWith(`linux-${releaseArchitecture}`)
  })?.path
}

function assertDesktopPackageEntries(
  entries: PackageEntry[],
  releaseArchitecture: ReleaseArchitecture,
  executablePath: string,
  desktopRoot: string,
  iconRoot: string,
): void {
  const executable = entries.find(entry => entry.path === executablePath)
  if (!executable)
    throw new Error(`Missing executable: ${executablePath}`)
  if (!isRegularFile(executable) || !isExecutable(executable))
    throw new Error(`Desktop executable is not executable: ${executablePath}`)

  if (!entries.some(entry => isRegularFile(entry) && entry.path.startsWith(desktopRoot) && entry.path.endsWith('.desktop')))
    throw new Error('Missing desktop entry')
  if (!entries.some(entry => isRegularFile(entry) && entry.path.startsWith(iconRoot) && entry.path.includes('/apps/') && entry.path.endsWith('.png')))
    throw new Error('Missing application icon')

  const foreignNativePayload = findForeignNativePayload(entries, releaseArchitecture)
  if (foreignNativePayload)
    throw new Error(`Foreign native payload for ${releaseArchitecture}: ${foreignNativePayload}`)
}

/**
 * Makes sure that a Debian package contains the files and metadata that AIRI needs.
 *
 * This check does not start the application. Use the launch smoke after extraction.
 */
export function assertDebPackageContract(inspection: DebPackageInspection, releaseArchitecture: ReleaseArchitecture): void {
  if (inspection.packageName !== 'ai.moeru.airi') {
    throw new Error(`Expected Debian package ai.moeru.airi, received ${inspection.packageName}`)
  }

  const expectedArchitecture = releaseArchitecture === 'arm64' ? 'arm64' : 'amd64'
  if (inspection.architecture !== expectedArchitecture) {
    throw new Error(`Expected Debian architecture ${expectedArchitecture}, received ${inspection.architecture}`)
  }

  assertDesktopPackageEntries(
    inspection.entries,
    releaseArchitecture,
    './opt/AIRI/airi',
    './usr/share/applications/',
    './usr/share/icons/',
  )
}

/**
 * Makes sure that an RPM contains AIRI's native executable and desktop integration.
 */
export function assertRpmPackageContract(inspection: RpmPackageInspection, releaseArchitecture: ReleaseArchitecture): void {
  if (inspection.packageName !== 'ai.moeru.airi')
    throw new Error(`Expected RPM package ai.moeru.airi, received ${inspection.packageName}`)

  const expectedArchitecture = releaseArchitecture === 'arm64' ? 'aarch64' : 'x86_64'
  if (inspection.architecture !== expectedArchitecture)
    throw new Error(`Expected RPM architecture ${expectedArchitecture}, received ${inspection.architecture}`)

  const executablePath = '/opt/AIRI/airi'
  const validRemovalScript = inspection.scripts.includes(`if [ ! -e '${executablePath}' ]; then`)
    && inspection.scripts.includes(`update-alternatives --remove 'airi' '${executablePath}'`)
    && inspection.scripts.includes('find \'/opt/AIRI\' -depth -type d -empty -delete')
    && !inspection.scripts.includes('update-alternatives --remove \'airi\' \'/usr/bin/airi\'')
  if (!validRemovalScript)
    throw new Error(`RPM removal script must preserve upgrades and remove ${executablePath}`)

  assertDesktopPackageEntries(
    inspection.entries,
    releaseArchitecture,
    executablePath,
    '/usr/share/applications/',
    '/usr/share/icons/',
  )
}

/**
 * Makes sure that a Flatpak exports AIRI's launcher, icon, and matching native payload.
 * Returns the checked executable entry for later architecture checks.
 */
export function assertFlatpakPackageContract(inspection: FlatpakPackageInspection, releaseArchitecture: ReleaseArchitecture): string {
  if (inspection.appId !== 'ai.moeru.airi')
    throw new Error(`Expected Flatpak application ai.moeru.airi, received ${inspection.appId}`)

  const expectedArchitecture = releaseArchitecture === 'arm64' ? 'aarch64' : 'x86_64'
  if (inspection.architecture !== expectedArchitecture)
    throw new Error(`Expected Flatpak architecture ${expectedArchitecture}, received ${inspection.architecture}`)

  const expectedRuntime = `org.freedesktop.Platform/${expectedArchitecture}/24.08`
  if (inspection.runtime !== expectedRuntime)
    throw new Error(`Expected Flatpak runtime ${expectedRuntime}, received ${inspection.runtime}`)
  if (inspection.command !== 'airi.sh')
    throw new Error(`Expected Flatpak command airi.sh, received ${inspection.command}`)

  const executablePath = './files/lib/airi/airi'
  assertDesktopPackageEntries(
    inspection.entries,
    releaseArchitecture,
    executablePath,
    './export/share/applications/',
    './export/share/icons/',
  )

  const launcher = inspection.entries.find(entry => entry.path === './files/bin/airi.sh')
  if (!launcher || !isRegularFile(launcher) || !isExecutable(launcher))
    throw new Error('Flatpak launcher is missing or is not executable: ./files/bin/airi.sh')

  return executablePath
}

/**
 * Makes sure that the extracted ELF machine matches the release architecture.
 */
export function assertExecutableArchitecture(elfHeader: string, releaseArchitecture: ReleaseArchitecture): void {
  const expectedMachine = releaseArchitecture === 'arm64' ? 'AArch64' : 'Advanced Micro Devices X86-64'
  const machineLine = elfHeader.split('\n').find(line => line.trimStart().startsWith('Machine:'))
  const machine = machineLine?.slice(machineLine.indexOf(':') + 1).trim()
  if (machine !== expectedMachine)
    throw new Error(`Expected an ${expectedMachine} executable`)
}

/**
 * Makes sure that the Linux desktop entry starts AIRI and selects the AIRI icon.
 */
export function assertDesktopEntryContract(source: string): void {
  const fields = parseDesktopEntryFields(source)

  const executable = fields.get('Exec')?.split(' ')[0]
  if (executable !== '/opt/AIRI/airi')
    throw new Error('Desktop entry must use Exec=/opt/AIRI/airi')
  if (fields.get('Icon') !== 'airi')
    throw new Error('Desktop entry must use Icon=airi')
}

function parseDesktopEntryFields(source: string): Map<string, string> {
  return new Map(source
    .split('\n')
    .map((line) => {
      const separator = line.indexOf('=')
      return separator === -1 ? [] : [line.slice(0, separator), line.slice(separator + 1)]
    })
    .filter((field): field is [string, string] => field.length === 2))
}

/**
 * Makes sure that the exported Flatpak desktop entry uses its wrapper and application icon.
 */
export function assertFlatpakDesktopEntryContract(source: string): void {
  const fields = parseDesktopEntryFields(source)
  const executable = fields.get('Exec')?.split(' ')[0]
  if (executable !== 'airi.sh')
    throw new Error('Flatpak desktop entry must use Exec=airi.sh')
  if (fields.get('Icon') !== 'ai.moeru.airi')
    throw new Error('Flatpak desktop entry must use Icon=ai.moeru.airi')
}

/**
 * Returns true when the application stays active until the smoke-test timer stops it.
 */
export function isSuccessfulLaunchSmoke(result: LaunchSmokeResult): boolean {
  return result.timedOut
}

function parseDebFields(output: string): Pick<DebPackageInspection, 'architecture' | 'packageName'> {
  const fields = new Map(output
    .split('\n')
    .map(line => line.split(':', 2).map(value => value.trim()))
    .filter((field): field is [string, string] => field.length === 2 && Boolean(field[0]) && Boolean(field[1])))

  return {
    packageName: fields.get('Package') ?? '',
    architecture: fields.get('Architecture') ?? '',
  }
}

function parseDebEntries(output: string): PackageEntry[] {
  return output
    .split('\n')
    .map((line) => {
      const columns = line.trim().split(/\s+/)
      if (columns.length < 6 || columns[0].length !== 10)
        return undefined

      return {
        mode: columns[0],
        path: columns[5],
      }
    })
    .filter((entry): entry is PackageEntry => entry !== undefined)
}

async function inspectDebPackage(packagePath: string): Promise<DebPackageInspection> {
  const [{ stdout: fields }, { stdout: contents }] = await Promise.all([
    execFile('dpkg-deb', ['--field', packagePath, 'Package', 'Architecture'], { encoding: 'utf8' }),
    execFile('dpkg-deb', ['--contents', packagePath], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }),
  ])

  return {
    ...parseDebFields(fields),
    entries: parseDebEntries(contents),
  }
}

function parseRpmEntries(output: string): PackageEntry[] {
  return output
    .split('\n')
    .map((line) => {
      const columns = line.trim().split(/\s+/)
      if (columns.length < 5 || !columns[0].startsWith('/'))
        return undefined

      return {
        path: columns[0],
        mode: columns[4],
      }
    })
    .filter((entry): entry is PackageEntry => entry !== undefined)
}

async function inspectRpmPackage(packagePath: string, runtimeRoot: string): Promise<RpmPackageInspection> {
  const databasePath = join(runtimeRoot, 'rpm-db')
  await mkdir(databasePath, { recursive: true })

  const [{ stdout: fields }, { stdout: entries }, { stdout: signature }, { stdout: scripts }] = await Promise.all([
    execFile('rpm', [
      '--dbpath',
      databasePath,
      '-qp',
      '--queryformat',
      'Package: %{NAME}\nArchitecture: %{ARCH}\n',
      packagePath,
    ], { encoding: 'utf8' }),
    execFile('rpm', ['--dbpath', databasePath, '-qpl', '--dump', packagePath], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }),
    execFile('rpm', ['--dbpath', databasePath, '--checksig', packagePath], { encoding: 'utf8' }),
    execFile('rpm', ['--dbpath', databasePath, '-qp', '--scripts', packagePath], { encoding: 'utf8' }),
  ])

  if (!signature.includes('digests OK'))
    throw new Error(`RPM digest verification failed: ${signature.trim()}`)

  const metadata = parseDebFields(fields)
  return {
    packageName: metadata.packageName,
    architecture: metadata.architecture,
    scripts,
    entries: parseRpmEntries(entries),
  }
}

async function extractRpmPackage(packagePath: string, extractionRoot: string): Promise<void> {
  await new Promise((resolveExtraction, reject) => {
    const decoder = spawn('rpm2cpio', [packagePath], { stdio: ['ignore', 'pipe', 'pipe'] })
    const extractor = spawn('bsdtar', ['--extract', '--file', '-', '--directory', extractionRoot], { stdio: ['pipe', 'ignore', 'pipe'] })
    decoder.stdout.pipe(extractor.stdin)

    const errors: Buffer[] = []
    decoder.stderr.on('data', chunk => errors.push(chunk))
    extractor.stderr.on('data', chunk => errors.push(chunk))

    let decoderComplete = false
    let decoderExitCode: number | null = null
    let extractorComplete = false
    let extractorExitCode: number | null = null
    const finish = () => {
      if (!decoderComplete || !extractorComplete)
        return
      if (decoderExitCode !== 0 || extractorExitCode !== 0) {
        reject(new Error(`RPM extraction failed: ${Buffer.concat(errors).toString('utf8').trim()}`))
        return
      }
      resolveExtraction()
    }

    decoder.once('error', reject)
    extractor.once('error', reject)
    decoder.once('close', (exitCode) => {
      decoderComplete = true
      decoderExitCode = exitCode
      finish()
    })
    extractor.once('close', (exitCode) => {
      extractorComplete = true
      extractorExitCode = exitCode
      finish()
    })
  })
}

function parseFlatpakMetadata(source: string): Pick<FlatpakPackageInspection, 'appId' | 'command' | 'runtime'> {
  const fields = new Map<string, string>()
  let section = ''

  for (const line of source.split('\n')) {
    const trimmedLine = line.trim()
    if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
      section = trimmedLine.slice(1, -1)
      continue
    }
    if (section !== 'Application')
      continue

    const separator = trimmedLine.indexOf('=')
    if (separator !== -1)
      fields.set(trimmedLine.slice(0, separator), trimmedLine.slice(separator + 1))
  }

  return {
    appId: fields.get('name') ?? '',
    command: fields.get('command') ?? '',
    runtime: (fields.get('runtime') ?? '').replace(/^runtime\//, ''),
  }
}

async function listPackageEntries(rootPath: string, relativePath = ''): Promise<PackageEntry[]> {
  const entries: PackageEntry[] = []
  for (const name of await readdir(join(rootPath, relativePath))) {
    const childRelativePath = join(relativePath, name)
    const childPath = join(rootPath, childRelativePath)
    const childStats = await lstat(childPath)
    entries.push({
      path: `./${childRelativePath}`,
      mode: `0${childStats.mode.toString(8)}`,
    })
    if (childStats.isDirectory())
      entries.push(...await listPackageEntries(rootPath, childRelativePath))
  }
  return entries
}

async function inspectFlatpakPackage(packagePath: string, runtimeRoot: string): Promise<{
  checkoutPath: string
  inspection: FlatpakPackageInspection
}> {
  const repositoryPath = join(runtimeRoot, 'flatpak-repo')
  const checkoutPath = join(runtimeRoot, 'flatpak-checkout')
  await execFile('ostree', ['init', `--repo=${repositoryPath}`, '--mode=archive-z2'])
  await execFile('flatpak', ['build-import-bundle', repositoryPath, packagePath])

  const { stdout: refsOutput } = await execFile('ostree', [`--repo=${repositoryPath}`, 'refs'], { encoding: 'utf8' })
  const appRefs = refsOutput.split('\n').map(ref => ref.trim()).filter(ref => ref.startsWith('app/'))
  if (appRefs.length !== 1)
    throw new Error(`Expected one Flatpak application ref, received ${appRefs.length}`)

  const appRef = appRefs[0]
  // Flatpak bundle entries can record root ownership. CI checks out as an unprivileged user.
  await execFile('ostree', [`--repo=${repositoryPath}`, 'checkout', '--user-mode', appRef, checkoutPath])
  const metadata = parseFlatpakMetadata(await readFile(join(checkoutPath, 'metadata'), 'utf8'))

  return {
    checkoutPath,
    inspection: {
      ...metadata,
      architecture: appRef.split('/')[2] ?? '',
      entries: await listPackageEntries(checkoutPath),
    },
  }
}

async function runLaunchSmoke(executablePath: string, runtimeRoot: string): Promise<LaunchSmokeResult> {
  const homePath = join(runtimeRoot, 'home')
  const configPath = join(runtimeRoot, 'config')
  const cachePath = join(runtimeRoot, 'cache')
  await Promise.all([
    mkdir(homePath, { recursive: true }),
    mkdir(configPath, { recursive: true }),
    mkdir(cachePath, { recursive: true }),
  ])

  return await runTimedProcess('xvfb-run', [
    '--auto-servernum',
    executablePath,
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${join(runtimeRoot, 'user-data')}`,
  ], {
    ...process.env,
    HOME: homePath,
    XDG_CACHE_HOME: cachePath,
    XDG_CONFIG_HOME: configPath,
  })
}

async function runFlatpakLaunchSmoke(appId: string): Promise<LaunchSmokeResult> {
  const existingProcessIds = await findFlatpakAiriProcessIds()
  const result = await runTimedProcess('dbus-run-session', [
    '--',
    'xvfb-run',
    '--auto-servernum',
    'flatpak',
    'run',
    '--user',
    appId,
  ], process.env, async () => {
    await ignoreMissingFlatpak('flatpak', ['kill', appId])
    await stopNewFlatpakAiriProcesses(existingProcessIds)
  })
  await stopNewFlatpakAiriProcesses(existingProcessIds)
  return result
}

async function findFlatpakAiriProcessIds(): Promise<Set<number>> {
  const processIds = new Set<number>()
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/.test(entry))
      continue

    try {
      const commandLine = await readFile(join('/proc', entry, 'cmdline'), 'utf8')
      if (commandLine.includes('/app/lib/airi/airi'))
        processIds.add(Number(entry))
    }
    catch {
      // A process can exit between the directory listing and the command-line read.
    }
  }
  return processIds
}

async function signalProcessIds(processIds: Set<number>, signal: Signals): Promise<void> {
  for (const processId of processIds) {
    try {
      process.kill(processId, signal)
    }
    catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (code !== 'ESRCH')
        throw error
    }
  }
}

async function stopNewFlatpakAiriProcesses(existingProcessIds: Set<number>): Promise<void> {
  const newProcessIds = await findFlatpakAiriProcessIds()
  for (const processId of existingProcessIds)
    newProcessIds.delete(processId)
  await signalProcessIds(newProcessIds, 'SIGTERM')

  await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
  const remainingProcessIds = await findFlatpakAiriProcessIds()
  for (const processId of existingProcessIds)
    remainingProcessIds.delete(processId)
  await signalProcessIds(remainingProcessIds, 'SIGKILL')
}

async function ignoreMissingFlatpak(command: string, args: string[]): Promise<void> {
  try {
    await execFile(command, args)
  }
  catch (error) {
    const message = errorMessageFrom(error) ?? ''
    if (!message.includes('is not running') && !message.includes('is not installed'))
      throw error
  }
}

/**
 * Inspects and starts an AIRI Debian package on its native Linux runner.
 *
 * Call stack:
 *
 * verifyLinuxPackage
 *   -> inspectDebPackage
 *   -> {@link assertDebPackageContract}
 *   -> runLaunchSmoke
 *     -> {@link isSuccessfulLaunchSmoke}
 */
export async function verifyLinuxPackage(packagePath: string, architecture: ReleaseArchitecture): Promise<void> {
  const resolvedPackagePath = resolve(packagePath)
  const packageStats = await stat(resolvedPackagePath)
  if (!packageStats.isFile())
    throw new Error(`Debian package is not a file: ${resolvedPackagePath}`)

  const inspection = await inspectDebPackage(resolvedPackagePath)
  assertDebPackageContract(inspection, architecture)

  // The AIRI package expands beyond small RAM-backed /tmp mounts. Keep extraction on the artifact filesystem.
  const extractionRoot = await mkdtemp(join(dirname(resolvedPackagePath), '.airi-linux-package-'))
  try {
    await execFile('dpkg-deb', ['--extract', resolvedPackagePath, extractionRoot])
    const executablePath = join(extractionRoot, 'opt', 'AIRI', 'airi')
    const desktopEntryPath = join(extractionRoot, 'usr', 'share', 'applications', 'airi.desktop')
    const [{ stdout: elfHeader }, desktopEntry] = await Promise.all([
      execFile('readelf', ['--file-header', executablePath], { encoding: 'utf8' }),
      readFile(desktopEntryPath, 'utf8'),
    ])
    assertExecutableArchitecture(elfHeader, architecture)
    assertDesktopEntryContract(desktopEntry)

    const launchResult = await runLaunchSmoke(executablePath, join(extractionRoot, '.smoke-runtime'))
    if (!isSuccessfulLaunchSmoke(launchResult)) {
      throw new Error(`AIRI exited before the launch-smoke window ended (exit code: ${launchResult.exitCode}, signal: ${launchResult.signal ?? 'none'})`)
    }
  }
  finally {
    await rm(extractionRoot, { recursive: true, force: true })
  }
}

/**
 * Inspects and starts an AIRI RPM package on its native Linux runner.
 *
 * Call stack:
 *
 * verifyRpmPackage
 *   -> inspectRpmPackage
 *   -> {@link assertRpmPackageContract}
 *   -> runLaunchSmoke
 */
export async function verifyRpmPackage(packagePath: string, architecture: ReleaseArchitecture): Promise<void> {
  const resolvedPackagePath = resolve(packagePath)
  const packageStats = await stat(resolvedPackagePath)
  if (!packageStats.isFile())
    throw new Error(`RPM package is not a file: ${resolvedPackagePath}`)

  const extractionRoot = await mkdtemp(join(dirname(resolvedPackagePath), '.airi-rpm-package-'))
  try {
    const inspection = await inspectRpmPackage(resolvedPackagePath, extractionRoot)
    assertRpmPackageContract(inspection, architecture)

    await extractRpmPackage(resolvedPackagePath, extractionRoot)
    const executablePath = join(extractionRoot, 'opt', 'AIRI', 'airi')
    const desktopEntryPath = join(extractionRoot, 'usr', 'share', 'applications', 'airi.desktop')
    const [{ stdout: elfHeader }, desktopEntry] = await Promise.all([
      execFile('readelf', ['--file-header', executablePath], { encoding: 'utf8' }),
      readFile(desktopEntryPath, 'utf8'),
    ])
    assertExecutableArchitecture(elfHeader, architecture)
    assertDesktopEntryContract(desktopEntry)

    const launchResult = await runLaunchSmoke(executablePath, join(extractionRoot, '.smoke-runtime'))
    if (!isSuccessfulLaunchSmoke(launchResult))
      throw new Error(`RPM AIRI exited before the launch-smoke window ended (exit code: ${launchResult.exitCode}, signal: ${launchResult.signal ?? 'none'})`)
  }
  finally {
    await rm(extractionRoot, { recursive: true, force: true })
  }
}

/**
 * Inspects and starts an AIRI Flatpak bundle on its native Linux runner.
 *
 * Call stack:
 *
 * verifyFlatpakPackage
 *   -> inspectFlatpakPackage
 *   -> {@link assertFlatpakPackageContract}
 *   -> runFlatpakLaunchSmoke
 */
export async function verifyFlatpakPackage(packagePath: string, architecture: ReleaseArchitecture): Promise<void> {
  const resolvedPackagePath = resolve(packagePath)
  const packageStats = await stat(resolvedPackagePath)
  if (!packageStats.isFile())
    throw new Error(`Flatpak bundle is not a file: ${resolvedPackagePath}`)

  const runtimeRoot = await mkdtemp(join(dirname(resolvedPackagePath), '.airi-flatpak-package-'))
  let installedAppId: string | undefined
  try {
    const { checkoutPath, inspection } = await inspectFlatpakPackage(resolvedPackagePath, runtimeRoot)
    const executableEntryPath = assertFlatpakPackageContract(inspection, architecture)

    const executablePath = join(checkoutPath, executableEntryPath)
    const desktopEntryPath = join(checkoutPath, 'export', 'share', 'applications', 'ai.moeru.airi.desktop')
    const [{ stdout: elfHeader }, desktopEntry] = await Promise.all([
      execFile('readelf', ['--file-header', executablePath], { encoding: 'utf8' }),
      readFile(desktopEntryPath, 'utf8'),
    ])
    assertExecutableArchitecture(elfHeader, architecture)
    assertFlatpakDesktopEntryContract(desktopEntry)

    try {
      await execFile('flatpak', ['info', '--user', inspection.appId])
      throw new Error(`Flatpak application is already installed: ${inspection.appId}`)
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? ''
      if (!message.includes('is not installed') && !message.includes('not installed'))
        throw error
    }

    await execFile('flatpak', ['install', '--user', '--noninteractive', resolvedPackagePath])
    installedAppId = inspection.appId
    const launchResult = await runFlatpakLaunchSmoke(inspection.appId)
    if (!isSuccessfulLaunchSmoke(launchResult))
      throw new Error(`Flatpak AIRI exited before the launch-smoke window ended (exit code: ${launchResult.exitCode}, signal: ${launchResult.signal ?? 'none'})`)
  }
  finally {
    if (installedAppId) {
      await ignoreMissingFlatpak('flatpak', ['kill', installedAppId])
      await ignoreMissingFlatpak('flatpak', ['uninstall', '--user', '--noninteractive', installedAppId])
    }
    await rm(runtimeRoot, { recursive: true, force: true })
  }
}

/**
 * Reads CLI arguments and verifies the DEB, RPM, and Flatpak release artifacts.
 *
 * Call stack:
 *
 * main
 *   -> {@link verifyLinuxPackage}
 *   -> {@link verifyRpmPackage}
 *   -> {@link verifyFlatpakPackage}
 */
async function main(): Promise<void> {
  const cli = cac('verify-linux-package')
    .option('--deb <path>', 'Path to the Debian package', { type: [String] })
    .option('--rpm <path>', 'Path to the RPM package', { type: [String] })
    .option('--flatpak <path>', 'Path to the Flatpak bundle', { type: [String] })
    .option('--arch <architecture>', 'Release architecture: x64 or arm64', { type: [String] })

  const args = cli.parse()
  const debPath = String(args.options.deb?.[0] ?? '').trim()
  const rpmPath = String(args.options.rpm?.[0] ?? '').trim()
  const flatpakPath = String(args.options.flatpak?.[0] ?? '').trim()
  const architecture = String(args.options.arch?.[0] ?? '').trim()

  if (!debPath)
    throw new Error('--deb is required')
  if (!rpmPath)
    throw new Error('--rpm is required')
  if (!flatpakPath)
    throw new Error('--flatpak is required')
  if (architecture !== 'x64' && architecture !== 'arm64')
    throw new Error('--arch must be x64 or arm64')

  await verifyLinuxPackage(debPath, architecture)
  await verifyRpmPackage(rpmPath, architecture)
  await verifyFlatpakPackage(flatpakPath, architecture)
  console.info(`Linux package verification passed for ${architecture}`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(errorMessageFrom(error) ?? 'Linux package verification failed')
    process.exit(1)
  })
}
