import process from 'node:process'

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { getVisualChatDir } from '@proj-airi/visual-chat-shared'

const DEFAULT_ENDPOINTS_FILE = process.env.AIRI_VISUAL_CHAT_PUBLIC_ENDPOINTS_FILE?.trim()
  || join(getVisualChatDir('config'), 'public-endpoints.json')
const CLOUDFLARED_CACHE_DIR = join(getVisualChatDir('cache'), 'cloudflared')
const QUICK_TUNNEL_PATTERN = /https:\/\/(?!api\.)[-a-z0-9]+\.trycloudflare\.com/i
const DOWNLOAD_TIMEOUT_MS = 120_000
const STARTUP_TIMEOUT_MS = 90_000
const HEALTH_POLL_INTERVAL_MS = 1_000
const QUICK_TUNNEL_MAX_ATTEMPTS = 3

interface ShareConfig {
  frontendTarget: string
  gatewayTarget: string
  frontendUrl?: string
  gatewayUrl?: string
  endpointsFile: string
  clearOnly: boolean
}

interface ShareHandle {
  name: string
  url: string
  close: () => void
  onError: (callback: (error: Error) => void) => void
}

interface CloudflaredDownloadSpec {
  downloadUrl: string
  cacheKey: string
  executableName: string
  archiveName?: string
}

function sanitizeUrl(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  if (!normalized)
    return undefined

  return new URL(normalized).toString()
}

function parseArgValue(args: string[], name: string): string | undefined {
  const inline = args.find(arg => arg.startsWith(`${name}=`))
  if (inline)
    return inline.slice(name.length + 1)

  const index = args.indexOf(name)
  if (index < 0)
    return undefined

  const value = args[index + 1]
  if (!value || value.startsWith('--'))
    return undefined

  return value
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

function parseConfig(argv: string[]): ShareConfig {
  return {
    frontendTarget: parseArgValue(argv, '--frontend-target')?.trim() || 'http://127.0.0.1:5173',
    gatewayTarget: parseArgValue(argv, '--gateway-target')?.trim() || 'http://127.0.0.1:6200',
    frontendUrl: parseArgValue(argv, '--frontend-url')?.trim(),
    gatewayUrl: parseArgValue(argv, '--gateway-url')?.trim(),
    endpointsFile: parseArgValue(argv, '--endpoints-file')?.trim() || DEFAULT_ENDPOINTS_FILE,
    clearOnly: hasFlag(argv, '--clear'),
  }
}

function writePublicEndpointsFile(endpointsFile: string, payload: { frontendUrl: string, gatewayUrl: string, source: string }) {
  mkdirSync(dirname(endpointsFile), { recursive: true })
  writeFileSync(endpointsFile, `${JSON.stringify({
    ...payload,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8')
}

function removePublicEndpointsFile(endpointsFile: string) {
  if (existsSync(endpointsFile))
    rmSync(endpointsFile, { force: true })
}

async function isUrlReachable(url: string, timeoutMs: number = 1500): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    })

    return response.status < 500
  }
  catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForTarget(name: string, targetUrl: string, timeoutMs: number = STARTUP_TIMEOUT_MS) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await isUrlReachable(targetUrl))
      return

    await sleep(HEALTH_POLL_INTERVAL_MS)
  }

  throw new Error(`${name} target did not become reachable in time: ${targetUrl}`)
}

async function commandExists(command: string): Promise<boolean> {
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `where ${command}`]
    : ['-lc', `command -v ${command}`]
  const executable = process.platform === 'win32'
    ? (process.env.ComSpec || 'cmd.exe')
    : '/bin/sh'

  return new Promise<boolean>((resolve) => {
    const child = spawn(executable, args, {
      stdio: 'ignore',
      windowsHide: true,
    })

    child.once('error', () => resolve(false))
    child.once('exit', code => resolve(code === 0))
  })
}

async function runCommand(command: string, args: string[]): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
      },
      stdio: 'inherit',
      windowsHide: true,
    })

    child.once('error', () => resolve(false))
    child.once('exit', code => resolve(code === 0))
  })
}

function findInstalledCloudflaredBinary(): string | null {
  if (process.platform !== 'win32')
    return null

  const candidates = [
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    `${process.env.LOCALAPPDATA || ''}\\Microsoft\\WinGet\\Links\\cloudflared.exe`,
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate))
      return candidate
  }

  return null
}

function resolveCloudflaredDownloadSpec(): CloudflaredDownloadSpec {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'win32' && arch === 'x64') {
    return {
      downloadUrl: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
      cacheKey: 'win32-x64',
      executableName: 'cloudflared.exe',
    }
  }

  if (platform === 'win32' && arch === 'ia32') {
    return {
      downloadUrl: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe',
      cacheKey: 'win32-ia32',
      executableName: 'cloudflared.exe',
    }
  }

  if (platform === 'win32' && arch === 'arm64') {
    return {
      downloadUrl: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-arm64.exe',
      cacheKey: 'win32-arm64',
      executableName: 'cloudflared.exe',
    }
  }

  if (platform === 'linux' && arch === 'x64') {
    return {
      downloadUrl: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
      cacheKey: 'linux-x64',
      executableName: 'cloudflared',
    }
  }

  if (platform === 'linux' && arch === 'arm64') {
    return {
      downloadUrl: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64',
      cacheKey: 'linux-arm64',
      executableName: 'cloudflared',
    }
  }

  if (platform === 'linux' && arch === 'arm') {
    return {
      downloadUrl: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm',
      cacheKey: 'linux-arm',
      executableName: 'cloudflared',
    }
  }

  if (platform === 'darwin' && arch === 'x64') {
    return {
      downloadUrl: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz',
      cacheKey: 'darwin-x64',
      executableName: 'cloudflared',
      archiveName: 'cloudflared.tgz',
    }
  }

  if (platform === 'darwin' && arch === 'arm64') {
    return {
      downloadUrl: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz',
      cacheKey: 'darwin-arm64',
      executableName: 'cloudflared',
      archiveName: 'cloudflared.tgz',
    }
  }

  throw new Error(`Unsupported platform for automatic cloudflared setup: ${platform}/${arch}`)
}

async function downloadFile(url: string, destinationPath: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  })

  if (!response.ok)
    throw new Error(`Failed to download ${url} (HTTP ${response.status})`)

  const bytes = new Uint8Array(await response.arrayBuffer())
  mkdirSync(dirname(destinationPath), { recursive: true })
  writeFileSync(destinationPath, bytes)
}

function ensureExecutableMode(filePath: string) {
  if (process.platform !== 'win32')
    execFileSync('chmod', ['755', filePath], { stdio: 'ignore' })
}

async function ensureCloudflaredBinary(): Promise<string> {
  const envBinary = process.env.AIRI_VISUAL_CHAT_CLOUDFLARED_BIN?.trim()
  if (envBinary) {
    if (!existsSync(envBinary))
      throw new Error(`AIRI_VISUAL_CHAT_CLOUDFLARED_BIN points to a missing file: ${envBinary}`)
    return envBinary
  }

  if (await commandExists('cloudflared'))
    return 'cloudflared'

  const installedBinary = findInstalledCloudflaredBinary()
  if (installedBinary)
    return installedBinary

  if (process.platform === 'win32' && await commandExists('winget')) {
    console.info('Installing cloudflared with winget...')
    const installed = await runCommand('winget', [
      'install',
      '--id',
      'Cloudflare.cloudflared',
      '--exact',
      '--source',
      'winget',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--disable-interactivity',
    ])

    if (installed) {
      if (await commandExists('cloudflared'))
        return 'cloudflared'

      const wingetBinary = findInstalledCloudflaredBinary()
      if (wingetBinary)
        return wingetBinary
    }
  }

  const spec = resolveCloudflaredDownloadSpec()
  const cacheDir = resolve(CLOUDFLARED_CACHE_DIR, spec.cacheKey)
  const executablePath = resolve(cacheDir, spec.executableName)
  if (existsSync(executablePath)) {
    ensureExecutableMode(executablePath)
    return executablePath
  }

  mkdirSync(cacheDir, { recursive: true })
  console.info(`Downloading cloudflared for ${spec.cacheKey}...`)

  if (spec.archiveName) {
    const archivePath = resolve(cacheDir, spec.archiveName)
    await downloadFile(spec.downloadUrl, archivePath)
    execFileSync('tar', ['-xzf', archivePath, '-C', cacheDir], { stdio: 'ignore' })
    rmSync(archivePath, { force: true })
  }
  else {
    await downloadFile(spec.downloadUrl, executablePath)
  }

  if (!existsSync(executablePath))
    throw new Error(`cloudflared download completed, but ${executablePath} was not created.`)

  ensureExecutableMode(executablePath)
  return executablePath
}

async function waitForQuickTunnelUrl(binaryPath: string, targetName: string, targetUrl: string): Promise<ShareHandle> {
  return new Promise((resolve, reject) => {
    let settled = false
    let recentOutput = ''
    let timeout: ReturnType<typeof setTimeout>
    const child = spawn(binaryPath, ['tunnel', '--url', targetUrl, '--no-autoupdate', '--protocol', 'http2'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const settleResolve = (handle: ShareHandle) => {
      if (settled)
        return

      settled = true
      clearTimeout(timeout)
      resolve(handle)
    }

    const settleReject = (error: Error) => {
      if (settled)
        return

      settled = true
      clearTimeout(timeout)
      reject(error)
    }

    const appendOutput = (text: string) => {
      recentOutput = `${recentOutput}${text}`.slice(-4000)
    }

    const withRecentOutput = (summary: string) => {
      const details = recentOutput.trim()
      return details ? `${summary}\nLast cloudflared output:\n${details}` : summary
    }

    timeout = setTimeout(() => {
      child.kill()
      settleReject(new Error(withRecentOutput(`${targetName} quick tunnel did not produce a public URL in time.`)))
    }, 30_000)

    function handleChunk(chunk: Uint8Array | string) {
      const text = chunk.toString()
      appendOutput(text)
      const match = text.match(QUICK_TUNNEL_PATTERN)
      if (!match)
        return

      settleResolve({
        name: targetName,
        url: match[0],
        close: () => child.kill(),
        onError(callback) {
          child.on('error', callback)
          child.on('exit', (code, signal) => {
            callback(new Error(`${targetName} quick tunnel exited (${signal ? `signal ${signal}` : `code ${code ?? 0}`}).`))
          })
        },
      })
    }

    child.stdout?.on('data', handleChunk)
    child.stderr?.on('data', handleChunk)
    child.once('error', (error) => {
      settleReject(new Error(withRecentOutput(`${targetName} quick tunnel failed to start: ${error.message}`)))
    })
    child.once('exit', (code, signal) => {
      const summary = signal
        ? `${targetName} quick tunnel exited before becoming ready (signal ${signal}).`
        : `${targetName} quick tunnel exited before becoming ready (code ${code ?? 1}).`
      settleReject(new Error(withRecentOutput(summary)))
    })
  })
}

async function waitForQuickTunnelUrlWithRetry(binaryPath: string, targetName: string, targetUrl: string): Promise<ShareHandle> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= QUICK_TUNNEL_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await waitForQuickTunnelUrl(binaryPath, targetName, targetUrl)
    }
    catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt >= QUICK_TUNNEL_MAX_ATTEMPTS)
        break

      console.warn(`${targetName} quick tunnel attempt ${attempt} failed. Retrying...`)
      await sleep(attempt * 2_000)
    }
  }

  throw lastError ?? new Error(`${targetName} quick tunnel failed without an error message.`)
}

export interface TunnelPair {
  frontendUrl: string
  gatewayUrl: string
  endpointsFile: string
  close: () => void
}

export async function createTunnelPair(options: {
  frontendTarget?: string
  gatewayTarget?: string
  endpointsFile?: string
}): Promise<TunnelPair> {
  const frontendTarget = options.frontendTarget || 'http://127.0.0.1:5173'
  const gatewayTarget = options.gatewayTarget || 'http://127.0.0.1:6200'
  const endpointsFile = options.endpointsFile || DEFAULT_ENDPOINTS_FILE

  await Promise.all([
    waitForTarget('frontend', frontendTarget),
    waitForTarget('gateway', gatewayTarget),
  ])

  const cloudflaredBinary = await ensureCloudflaredBinary()
  const frontendTunnel = await waitForQuickTunnelUrlWithRetry(cloudflaredBinary, 'frontend', frontendTarget)
  let gatewayTunnel: ShareHandle

  try {
    gatewayTunnel = await waitForQuickTunnelUrlWithRetry(cloudflaredBinary, 'gateway', gatewayTarget)
  }
  catch (error) {
    frontendTunnel.close()
    throw error
  }

  writePublicEndpointsFile(endpointsFile, {
    frontendUrl: frontendTunnel.url,
    gatewayUrl: gatewayTunnel.url,
    source: 'cloudflared',
  })

  return {
    frontendUrl: frontendTunnel.url,
    gatewayUrl: gatewayTunnel.url,
    endpointsFile,
    close() {
      frontendTunnel.close()
      gatewayTunnel.close()
      removePublicEndpointsFile(endpointsFile)
    },
  }
}

export { ensureCloudflaredBinary, removePublicEndpointsFile, writePublicEndpointsFile }

export async function share() {
  const config = parseConfig(process.argv.slice(2))

  if (config.clearOnly) {
    removePublicEndpointsFile(config.endpointsFile)
    console.info(`Cleared Visual Chat public endpoints file: ${config.endpointsFile}`)
    return
  }

  if (config.frontendUrl || config.gatewayUrl) {
    const frontendUrl = sanitizeUrl(config.frontendUrl)
    const gatewayUrl = sanitizeUrl(config.gatewayUrl)
    if (!frontendUrl || !gatewayUrl)
      throw new Error('When using manual public URLs, both --frontend-url and --gateway-url must be valid absolute URLs.')

    writePublicEndpointsFile(config.endpointsFile, {
      frontendUrl,
      gatewayUrl,
      source: 'manual',
    })

    console.info('Registered Visual Chat public endpoints:')
    console.info(`  Frontend: ${frontendUrl}`)
    console.info(`  Gateway:  ${gatewayUrl}`)
    console.info(`  File:     ${config.endpointsFile}`)
    return
  }

  removePublicEndpointsFile(config.endpointsFile)

  console.info('Waiting for Visual Chat local targets...')
  console.info(`  Frontend target: ${config.frontendTarget}`)
  console.info(`  Gateway target:  ${config.gatewayTarget}`)

  await Promise.all([
    waitForTarget('frontend', config.frontendTarget),
    waitForTarget('gateway', config.gatewayTarget),
  ])

  const cloudflaredBinary = await ensureCloudflaredBinary()
  const frontendTunnel = await waitForQuickTunnelUrlWithRetry(cloudflaredBinary, 'frontend', config.frontendTarget)
  let gatewayTunnel: ShareHandle | undefined

  try {
    gatewayTunnel = await waitForQuickTunnelUrlWithRetry(cloudflaredBinary, 'gateway', config.gatewayTarget)
  }
  catch (error) {
    frontendTunnel.close()
    throw error
  }

  writePublicEndpointsFile(config.endpointsFile, {
    frontendUrl: frontendTunnel.url,
    gatewayUrl: gatewayTunnel.url,
    source: 'cloudflared',
  })

  console.info('Visual Chat public endpoints are ready via cloudflared:')
  console.info(`  Frontend: ${frontendTunnel.url}`)
  console.info(`  Gateway:  ${gatewayTunnel.url}`)
  console.info(`  File:     ${config.endpointsFile}`)
  console.info('Keep this command running while remote phones are connected.')

  let shuttingDown = false
  const shutdown = (exitCode: number) => {
    if (shuttingDown)
      return

    shuttingDown = true
    frontendTunnel.close()
    gatewayTunnel.close()
    removePublicEndpointsFile(config.endpointsFile)
    process.exit(exitCode)
  }

  frontendTunnel.onError((error) => {
    console.error(`[fatal] frontend share failed: ${error.message}`)
    shutdown(1)
  })
  gatewayTunnel.onError((error) => {
    console.error(`[fatal] gateway share failed: ${error.message}`)
    shutdown(1)
  })

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))

  await new Promise(() => {})
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  return !!entryPath && pathToFileURL(entryPath).href === import.meta.url
}

if (isDirectExecution()) {
  void share().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
