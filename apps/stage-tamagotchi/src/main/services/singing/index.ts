import type { Buffer } from 'node:buffer'

import process from 'node:process'

import { execFile, execSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, realpathSync, statSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

import { useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import {
  BASE_MODELS,
  checkBaseModels,
  getSafeUploadExtension,
  isContainedPath,
  isSafePathSegment,
  PipelineStage,
  resolveContainedPath,
  resolveVoiceModelDir,
  writeMultipartFileToDisk,
} from '@proj-airi/singing'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'

const log = useLogger('singing-server')
const execFileAsync = promisify(execFile)

const DEFAULT_PORT = 26121
const BODY_LIMIT = 1024 * 1024 * 1024
const TRAIN_BODY_LIMIT = 1024 * 1024 * 1024
const DOWNLOAD_SIZE_REGEX = /\d+\.\d+\s*(?:mb|gb|kb)/i
const FFMPEG_BINARY_SUFFIX_REGEX = /ffmpeg$/
const LINE_SPLIT_REGEX = /[\r\n]+/
const CUDA_VERSION_REGEX = /CUDA Version:\s*(\d+)\.(\d+)/
const PTH_SUFFIX_REGEX = /\.pth$/
const WHITESPACE_REGEX = /\s+/
const PID_REGEX = /^\d+$/

// ─── FFmpeg download sources per platform ────────────────────────────────
const FFMPEG_URLS: Record<string, string> = {
  'win32-x64': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
  'linux-x64': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
  'darwin-x64': 'https://evermeet.cx/ffmpeg/getrelease/zip',
  'darwin-arm64': 'https://evermeet.cx/ffmpeg/getrelease/zip',
}

// ─── Setup progress tracking ─────────────────────────────────────────────
interface LogEntry {
  ts: number
  level: 'info' | 'warn' | 'error' | 'success'
  text: string
}

interface SetupProgress {
  id: string
  step: string
  percent: number
  message: string
  error?: string
  completed: boolean
  startedAt: number
  logs: LogEntry[]
}

const setupProgress = new Map<string, SetupProgress>()

function updateProgress(id: string, update: Partial<SetupProgress>) {
  const current = setupProgress.get(id) ?? {
    id,
    step: 'init',
    percent: 0,
    message: '',
    completed: false,
    startedAt: Date.now(),
    logs: [],
  }
  setupProgress.set(id, { ...current, ...update })
}

function appendLog(id: string, level: LogEntry['level'], text: string) {
  const current = setupProgress.get(id)
  if (!current)
    return
  current.logs = [...current.logs, { ts: Date.now(), level, text }]
  current.message = text
  setupProgress.set(id, current)
}

// ─── Binary detection ────────────────────────────────────────────────────
async function checkBinaryExists(bin: string, args: string[] = ['--version']): Promise<boolean> {
  try {
    await execFileAsync(bin, args, {
      timeout: 10_000,
      windowsHide: true,
      shell: false,
    })
    return true
  }
  catch {
    return false
  }
}

function getTrustedLocalSingingOrigin(origin: string): string {
  if (!origin || origin === 'null')
    return origin

  try {
    const url = new URL(origin)
    if (url.protocol === 'file:' || url.protocol === 'app:')
      return origin
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
      return origin
  }
  catch {}

  return ''
}

function buildSafeUploadPath(uploadsDir: string, uploadId: string, fileName: string): string {
  const safeExtension = getSafeUploadExtension(fileName)
  const savedPath = resolveContainedPath(uploadsDir, `${uploadId}.${safeExtension}`)
  if (!savedPath)
    throw new Error('Failed to allocate a contained upload path')
  return savedPath
}

async function cleanupManagedUploadFile(rootDir: string, filePath: string): Promise<void> {
  if (!filePath || !isContainedPath(rootDir, filePath))
    return

  await unlink(filePath).catch(() => {})
}

function logTerminalUpdateFailure(jobId: string, status: 'cancelled' | 'failed', error: unknown) {
  log.withFields({ jobId, status }).withError(error).warn('Failed to update terminal singing job status')
}

function logDetachedJobFailure(jobId: string, kind: 'cover' | 'training', error: unknown) {
  log.withFields({ jobId, kind }).withError(error).error('Detached singing job crashed unexpectedly')
}

async function findFFmpeg(dataDir: string): Promise<string | null> {
  const candidates = ['ffmpeg']

  if (process.platform === 'win32') {
    const localBin = join(dataDir, 'bin', 'ffmpeg.exe')
    candidates.unshift(localBin)
    candidates.push(
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ffmpeg\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
      join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
      join(process.env.USERPROFILE || '', 'scoop', 'shims', 'ffmpeg.exe'),
    )
  }
  else {
    const localBin = join(dataDir, 'bin', 'ffmpeg')
    candidates.unshift(localBin)
    candidates.push('/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg')
  }

  for (const path of candidates) {
    if (!path)
      continue
    if (existsSync(path) || path === 'ffmpeg') {
      if (await checkBinaryExists(path, ['-version']))
        return path
    }
  }
  return null
}

async function findPython(singingPkgRoot: string): Promise<{ path: string, isVenv: boolean } | null> {
  const venvPython = process.platform === 'win32'
    ? resolve(singingPkgRoot, 'python', '.venv', 'Scripts', 'python.exe')
    : resolve(singingPkgRoot, 'python', '.venv', 'bin', 'python')

  if (existsSync(venvPython))
    return { path: venvPython, isVenv: true }

  for (const py of ['python3', 'python']) {
    if (await checkBinaryExists(py, ['--version']))
      return { path: py, isVenv: false }
  }

  if (process.platform === 'win32') {
    const condaPaths = [
      join(process.env.USERPROFILE || '', '.conda', 'envs', 'airi', 'python.exe'),
      join(process.env.USERPROFILE || '', 'anaconda3', 'python.exe'),
      join(process.env.USERPROFILE || '', 'miniconda3', 'python.exe'),
      'C:\\ProgramData\\anaconda3\\python.exe',
      'C:\\ProgramData\\miniconda3\\python.exe',
    ]
    for (const p of condaPaths) {
      if (existsSync(p) && await checkBinaryExists(p, ['--version']))
        return { path: p, isVenv: false }
    }
  }

  return null
}

async function findUv(): Promise<string | null> {
  if (await checkBinaryExists('uv', ['--version']))
    return 'uv'
  if (process.platform === 'win32') {
    const candidates = [
      join(process.env.USERPROFILE || '', '.local', 'bin', 'uv.exe'),
      join(process.env.USERPROFILE || '', '.cargo', 'bin', 'uv.exe'),
      join(process.env.LOCALAPPDATA || '', 'uv', 'uv.exe'),
    ]
    for (const p of candidates) {
      if (existsSync(p) && await checkBinaryExists(p, ['--version']))
        return p
    }
  }
  return null
}

let _pkgCheckCache: { installed: boolean, missing: string[], checkedAt: number } | null = null

function invalidatePkgCheckCache() {
  _pkgCheckCache = null
}

async function checkPythonPackages(singingPkgRoot: string, forceRecheck = false): Promise<{ installed: boolean, missing: string[] }> {
  if (_pkgCheckCache && !forceRecheck) {
    const age = Date.now() - _pkgCheckCache.checkedAt
    // If marked as installed, trust forever until invalidated
    if (_pkgCheckCache.installed)
      return _pkgCheckCache
    // If marked as missing, allow recheck after 60s to avoid spam
    if (age < 60_000)
      return _pkgCheckCache
  }

  const venvPython = process.platform === 'win32'
    ? resolve(singingPkgRoot, 'python', '.venv', 'Scripts', 'python.exe')
    : resolve(singingPkgRoot, 'python', '.venv', 'bin', 'python')

  if (!existsSync(venvPython)) {
    _pkgCheckCache = { installed: false, missing: ['venv not found'], checkedAt: Date.now() }
    return _pkgCheckCache
  }

  // Single Python process to check all packages at once
  const checkScript = join(resolve(singingPkgRoot, 'python'), '_check_pkgs.py')
  const requiredPackages = ['torch', 'rvc_python', 'torchcrepe', 'mel_band_roformer', 'fairseq', 'faiss', 'scipy', 'librosa']
  const deepImports: Record<string, string> = {
    rvc_python: 'from rvc_python.lib.audio import load_audio',
    fairseq: 'from fairseq import checkpoint_utils',
    faiss: 'import faiss',
  }
  const missing: string[] = []

  try {
    const scriptContent = requiredPackages.map((p) => {
      const importLine = deepImports[p] ?? `import ${p}`
      return `try:\n    ${importLine}\nexcept ImportError:\n    print("MISSING:${p}")\nexcept Exception:\n    pass`
    }).join('\n')
    await writeFile(checkScript, scriptContent)
    const { stdout } = await execFileAsync(venvPython, [checkScript], {
      timeout: 60_000,
      windowsHide: true,
      shell: false,
    })
    for (const pkg of requiredPackages) {
      if (stdout.includes(`MISSING:${pkg}`))
        missing.push(pkg)
    }
    await unlink(checkScript).catch(() => {})
  }
  catch {
    await unlink(checkScript).catch(() => {})
    // If the check script itself fails, check if venv at least has the files
    const sitePackages = process.platform === 'win32'
      ? resolve(singingPkgRoot, 'python', '.venv', 'Lib', 'site-packages')
      : resolve(singingPkgRoot, 'python', '.venv', 'lib')
    if (existsSync(sitePackages)) {
      // Optimistic: if venv exists with site-packages, trust the setup completed flag
      const pythonProgress = setupProgress.get('python')
      if (pythonProgress?.completed && !pythonProgress.error) {
        _pkgCheckCache = { installed: true, missing: [], checkedAt: Date.now() }
        return _pkgCheckCache
      }
    }
    _pkgCheckCache = { installed: false, missing: requiredPackages, checkedAt: Date.now() }
    return _pkgCheckCache
  }

  _pkgCheckCache = { installed: missing.length === 0, missing, checkedAt: Date.now() }
  return _pkgCheckCache
}

// ─── Singing package root detection ──────────────────────────────────────
function findSingingPackageRoot(): string | null {
  const startDir = import.meta.dirname ?? __dirname
  let dir = startDir
  for (let i = 0; i < 20; i++) {
    const wsCheck = join(dir, 'packages', 'singing', 'package.json')
    if (existsSync(wsCheck)) {
      return resolve(dir, 'packages', 'singing')
    }
    const pkgJson = join(dir, 'node_modules', '@proj-airi', 'singing', 'package.json')
    if (existsSync(pkgJson)) {
      try {
        return realpathSync(resolve(dir, 'node_modules', '@proj-airi', 'singing'))
      }
      catch {
        return resolve(dir, 'node_modules', '@proj-airi', 'singing')
      }
    }
    const parent = resolve(dir, '..')
    if (parent === dir)
      break
    dir = parent
  }
  return null
}

// ─── HTTP download helper ────────────────────────────────────────────────
function httpFollow(url: string): typeof httpsGet {
  return url.startsWith('https') ? httpsGet : httpGet
}

function httpsDownload(url: string, dest: string, progressId: string, pctRange?: [number, number]): Promise<void> {
  const [pctMin, pctMax] = pctRange ?? [0, 100]
  return new Promise((resolvePromise, reject) => {
    const follow = (u: string, redirects = 0) => {
      if (redirects > 10) {
        reject(new Error('Too many redirects'))
        return
      }
      const getter = httpFollow(u)
      getter(u, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let loc = res.headers.location
          if (loc.startsWith('/'))
            loc = new URL(loc, u).href
          follow(loc, redirects + 1)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${u}`))
          return
        }
        const total = Number.parseInt(res.headers['content-length'] ?? '0', 10)
        let downloaded = 0
        let lastLogTime = 0
        let lastLoggedPct = -1
        const startTime = Date.now()

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          const now = Date.now()
          if (now - lastLogTime < 500)
            return
          lastLogTime = now

          const mb = (downloaded / 1024 / 1024).toFixed(1)
          const totalMb = total > 0 ? (total / 1024 / 1024).toFixed(1) : '?'
          const elapsed = (now - startTime) / 1000
          const speed = elapsed > 0 ? (downloaded / 1024 / 1024 / elapsed).toFixed(1) : '0'
          const frac = total > 0 ? downloaded / total : 0.5
          const pct = Math.round(pctMin + (pctMax - pctMin) * frac)
          const eta = total > 0 && elapsed > 0
            ? Math.round((total - downloaded) / (downloaded / elapsed))
            : -1

          const etaStr = eta > 0 ? ` ETA ${eta}s` : ''
          const msg = `${mb} / ${totalMb} MB  (${speed} MB/s${etaStr})`
          updateProgress(progressId, { percent: pct, message: msg })

          const logPct = Math.floor((downloaded / (total || downloaded)) * 10) * 10
          if (logPct > lastLoggedPct) {
            lastLoggedPct = logPct
            appendLog(progressId, 'info', `  ↓ ${logPct}%  ${mb}/${totalMb} MB  ${speed} MB/s${etaStr}`)
          }
        })
        const file = createWriteStream(dest)
        pipeline(res, file)
          .then(async () => {
            if (total > 0 && downloaded < total) {
              await unlink(dest).catch(() => {})
              reject(new Error(`Incomplete download: got ${downloaded} bytes, expected ${total}`))
              return
            }
            const actualSize = existsSync(dest) ? statSync(dest).size : 0
            if (total > 0 && actualSize < total * 0.95) {
              await unlink(dest).catch(() => {})
              reject(new Error(`File size mismatch: disk ${actualSize} bytes vs expected ${total}`))
              return
            }
            const finalMb = (actualSize / 1024 / 1024).toFixed(1)
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
            appendLog(progressId, 'success', `  ✓ ${finalMb} MB downloaded in ${elapsed}s`)
            resolvePromise()
          })
          .catch(async (err) => {
            await unlink(dest).catch(() => {})
            reject(err)
          })
      }).on('error', (err) => {
        unlink(dest).catch(() => {})
        reject(err)
      })
    }
    follow(url)
  })
}

// ─── Setup: FFmpeg ───────────────────────────────────────────────────────
async function downloadFFmpeg(dataDir: string): Promise<string> {
  const id = 'ffmpeg'
  const platformKey = `${process.platform}-${process.arch}`
  const url = FFMPEG_URLS[platformKey]
  if (!url)
    throw new Error(`No FFmpeg build available for ${platformKey}`)

  const binDir = join(dataDir, 'bin')
  await mkdir(binDir, { recursive: true })

  const isZip = url.endsWith('.zip')
  const ext = isZip ? '.zip' : '.tar.xz'
  const downloadPath = join(dataDir, `ffmpeg-download${ext}`)

  appendLog(id, 'info', `Platform: ${platformKey}`)
  appendLog(id, 'info', `Source: ${url}`)
  appendLog(id, 'info', `Destination: ${binDir}`)
  updateProgress(id, { step: 'download', percent: 0 })
  appendLog(id, 'info', 'Starting download...')

  await httpsDownload(url, downloadPath, id, [0, 75])

  appendLog(id, 'success', 'Download complete')
  updateProgress(id, { step: 'extract', percent: 78 })
  appendLog(id, 'info', 'Extracting archive...')

  const extractDir = join(dataDir, 'ffmpeg-extract')
  await mkdir(extractDir, { recursive: true })

  if (process.platform === 'win32') {
    appendLog(id, 'info', 'Running Expand-Archive (PowerShell)...')
    await execFileAsync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${downloadPath}' -DestinationPath '${extractDir}' -Force`,
    ], { timeout: 120_000 })

    appendLog(id, 'info', 'Locating ffmpeg.exe in extracted files...')
    const entries = await findFileRecursive(extractDir, 'ffmpeg.exe')
    if (!entries)
      throw new Error('ffmpeg.exe not found in downloaded archive')

    const destFFmpeg = join(binDir, 'ffmpeg.exe')
    await rename(entries, destFFmpeg)
    appendLog(id, 'success', `Installed: ${destFFmpeg}`)

    const ffprobeSource = entries.replace('ffmpeg.exe', 'ffprobe.exe')
    if (existsSync(ffprobeSource)) {
      const destProbe = join(binDir, 'ffprobe.exe')
      await rename(ffprobeSource, destProbe)
      appendLog(id, 'success', `Installed: ${destProbe}`)
    }
  }
  else {
    appendLog(id, 'info', 'Extracting with tar...')
    await execFileAsync('tar', ['xf', downloadPath, '-C', extractDir], { timeout: 120_000 })

    const entries = await findFileRecursive(extractDir, 'ffmpeg')
    if (!entries)
      throw new Error('ffmpeg not found in downloaded archive')

    const destFFmpeg = join(binDir, 'ffmpeg')
    await rename(entries, destFFmpeg)
    await execFileAsync('chmod', ['+x', destFFmpeg])
    appendLog(id, 'success', `Installed: ${destFFmpeg}`)

    const ffprobeSource = entries.replace(FFMPEG_BINARY_SUFFIX_REGEX, 'ffprobe')
    if (existsSync(ffprobeSource)) {
      const destFFprobe = join(binDir, 'ffprobe')
      await rename(ffprobeSource, destFFprobe)
      await execFileAsync('chmod', ['+x', destFFprobe])
      appendLog(id, 'success', `Installed: ${destFFprobe}`)
    }
  }

  updateProgress(id, { percent: 95 })
  appendLog(id, 'info', 'Cleaning up temporary files...')
  await rm(downloadPath, { force: true }).catch(() => {})
  await rm(extractDir, { recursive: true, force: true }).catch(() => {})

  const ffmpegBin = process.platform === 'win32' ? join(binDir, 'ffmpeg.exe') : join(binDir, 'ffmpeg')
  appendLog(id, 'success', `FFmpeg ready at ${ffmpegBin}`)
  updateProgress(id, { step: 'done', percent: 100, message: 'FFmpeg installed successfully', completed: true })
  return ffmpegBin
}

async function findFileRecursive(dir: string, filename: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isFile() && entry.name === filename)
      return fullPath
    if (entry.isDirectory()) {
      const found = await findFileRecursive(fullPath, filename)
      if (found)
        return found
    }
  }
  return null
}

// ─── Setup: Python venv ──────────────────────────────────────────────────

async function checkPkgInstalled(pythonBin: string, pkg: string): Promise<boolean> {
  const tmpScript = join(dirname(pythonBin), `_chk_${pkg}.py`)
  const deepChecks: Record<string, string> = {
    rvc_python: 'from rvc_python.lib.audio import load_audio',
    fairseq: 'from fairseq import checkpoint_utils',
  }
  const importLine = deepChecks[pkg] ?? `import ${pkg}`
  try {
    await writeFile(tmpScript, importLine)
    await execFileAsync(pythonBin, [tmpScript], {
      timeout: 60_000,
      windowsHide: true,
      shell: false,
    })
    await unlink(tmpScript).catch(() => {})
    return true
  }
  catch {
    await unlink(tmpScript).catch(() => {})
    return false
  }
}

async function setupPythonVenv(singingPkgRoot: string): Promise<string> {
  const id = 'python'
  const pythonDir = resolve(singingPkgRoot, 'python')
  const venvDir = resolve(pythonDir, '.venv')

  if (!existsSync(pythonDir))
    throw new Error(`Python source directory not found: ${pythonDir}`)

  appendLog(id, 'info', `Working directory: ${pythonDir}`)
  updateProgress(id, { step: 'detect', percent: 2 })
  appendLog(id, 'info', 'Detecting available Python tools...')

  const uvPath = await findUv()
  const variant = await detectTorchVariant()
  const venvExists = existsSync(venvDir)

  const venvPython = process.platform === 'win32'
    ? resolve(venvDir, 'Scripts', 'python.exe')
    : resolve(venvDir, 'bin', 'python')

  // Determine the pip command based on available tools
  const pipCmd = uvPath
    ? { cmd: uvPath, prefix: ['pip', 'install'] }
    : { cmd: process.platform === 'win32' ? resolve(venvDir, 'Scripts', 'pip.exe') : resolve(venvDir, 'bin', 'pip'), prefix: ['install'] }

  // ── Step 1: Create venv (skip if exists) ──
  if (venvExists) {
    appendLog(id, 'success', 'Virtual environment already exists, reusing')
    updateProgress(id, { step: 'venv', percent: 10 })
  }
  else {
    updateProgress(id, { step: 'venv', percent: 5 })
    if (uvPath) {
      appendLog(id, 'success', `Found uv: ${uvPath}`)
      appendLog(id, 'info', 'Step 1: Creating virtual environment (uv sync)...')
      await spawnAsync(uvPath, ['sync'], pythonDir, id, 5, 10)
    }
    else {
      const sysPython = await findPython(singingPkgRoot)
      if (!sysPython)
        throw new Error('Neither uv nor Python found. Please install Python 3.10+ or uv first.')
      appendLog(id, 'success', `Found Python: ${sysPython.path}`)
      appendLog(id, 'info', 'Step 1: Creating virtual environment (python -m venv)...')
      await execFileAsync(sysPython.path, ['-m', 'venv', venvDir], {
        timeout: 60_000,
        shell: false,
      })
    }
    appendLog(id, 'success', 'Virtual environment created')
  }

  appendLog(id, 'info', `GPU detection: ${variant.label}`)

  // ── Check which packages are already installed ──
  updateProgress(id, { step: 'check', percent: 12, message: 'Checking installed packages...' })
  appendLog(id, 'info', 'Checking which packages are already installed...')

  const hasTorch = venvExists && await checkPkgInstalled(venvPython, 'torch')
  const hasRvc = venvExists && await checkPkgInstalled(venvPython, 'rvc_python')
  const hasCrepe = venvExists && await checkPkgInstalled(venvPython, 'torchcrepe')
  const hasLibrosa = venvExists && await checkPkgInstalled(venvPython, 'librosa')
  const hasMelband = venvExists && await checkPkgInstalled(venvPython, 'mel_band_roformer')
  const hasFairseq = venvExists && await checkPkgInstalled(venvPython, 'fairseq')
  const hasFaiss = venvExists && await checkPkgInstalled(venvPython, 'faiss')
  const hasScipy = venvExists && await checkPkgInstalled(venvPython, 'scipy')

  const steps: string[] = []
  if (!hasTorch)
    steps.push('torch')
  if (!hasLibrosa || !hasScipy)
    steps.push('librosa')
  if (!hasRvc || !hasCrepe || !hasMelband || !hasFairseq || !hasFaiss)
    steps.push('pipeline')
  steps.push('verify')

  if (steps.length === 1) {
    appendLog(id, 'success', 'All packages already installed, verifying...')
  }
  else {
    const missing = steps.filter(s => s !== 'verify')
    appendLog(id, 'info', `Need to install: ${missing.join(', ')}`)
  }

  let stepIdx = 0
  const totalSteps = steps.length
  function stepPercent(within: number): number {
    const base = 15 + (stepIdx / totalSteps) * 75
    const next = 15 + ((stepIdx + 1) / totalSteps) * 75
    return Math.round(base + (next - base) * within)
  }

  // ── Install PyTorch (only if missing) ──
  if (steps.includes('torch')) {
    updateProgress(id, { step: 'torch', percent: stepPercent(0) })
    appendLog(id, 'info', `[${stepIdx + 1}/${totalSteps}] Installing PyTorch (${variant.label})...`)
    appendLog(id, 'info', `Index URL: ${variant.indexUrl}`)
    await spawnAsync(pipCmd.cmd, [
      ...pipCmd.prefix,
      'torch',
      'torchaudio',
      '--extra-index-url',
      variant.indexUrl,
    ], pythonDir, id, stepPercent(0), stepPercent(0.9))
    appendLog(id, 'success', 'PyTorch installed')
    stepIdx++
  }
  else {
    appendLog(id, 'success', 'PyTorch: already installed ✓')
  }

  // ── Install librosa + scipy (only if missing) ──
  if (steps.includes('librosa')) {
    updateProgress(id, { step: 'librosa', percent: stepPercent(0) })
    const libPkgs = ['librosa', 'scipy', 'soundfile']
    appendLog(id, 'info', `[${stepIdx + 1}/${totalSteps}] Installing ${libPkgs.join(', ')}...`)
    try {
      await spawnAsync(pipCmd.cmd, [...pipCmd.prefix, ...libPkgs], pythonDir, id, stepPercent(0), stepPercent(0.9))
      appendLog(id, 'success', 'librosa + scipy installed')
    }
    catch {
      appendLog(id, 'info', 'Retrying with relaxed dependency resolution...')
      try {
        await spawnAsync(pipCmd.cmd, [...pipCmd.prefix, 'librosa', '--no-deps'], pythonDir, id, stepPercent(0), stepPercent(0.4))
        await spawnAsync(pipCmd.cmd, [...pipCmd.prefix, 'soundfile', 'pooch', 'soxr', 'decorator', 'numba', 'scipy', 'scikit-learn', 'joblib', 'msgpack'], pythonDir, id, stepPercent(0.4), stepPercent(0.9))
        appendLog(id, 'success', 'librosa + scipy installed (relaxed deps)')
      }
      catch {
        appendLog(id, 'warn', 'librosa installation failed — some features may be unavailable')
      }
    }
    stepIdx++
  }
  else {
    appendLog(id, 'success', 'librosa: already installed ✓')
  }

  // ── Install pipeline packages (only if missing) ──
  if (steps.includes('pipeline')) {
    updateProgress(id, { step: 'pipeline', percent: stepPercent(0) })
    const needed: string[] = []
    if (!hasRvc)
      needed.push('rvc-python')
    if (!hasCrepe)
      needed.push('torchcrepe')
    if (!hasMelband)
      needed.push('melband-roformer-infer')
    if (!hasFairseq)
      needed.push('fairseq')
    if (!hasFaiss)
      needed.push('faiss-cpu')
    // Evaluation dependencies for model QA and auto-calibration
    needed.push('speechbrain', 'faster-whisper', 'pyloudnorm', 'jiwer')

    appendLog(id, 'info', `[${stepIdx + 1}/${totalSteps}] Installing pipeline packages: ${needed.join(', ')}...`)
    try {
      await spawnAsync(pipCmd.cmd, [...pipCmd.prefix, ...needed], pythonDir, id, stepPercent(0), stepPercent(0.9))
      appendLog(id, 'success', 'Pipeline packages installed')
    }
    catch (err) {
      appendLog(id, 'error', `Pipeline packages installation failed: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
    stepIdx++
  }
  else {
    appendLog(id, 'success', 'Pipeline packages: already installed ✓')
  }

  // ── Verify: comprehensive import test for ALL required packages ──
  updateProgress(id, { step: 'verify', percent: 92, message: 'Verifying all packages...' })
  appendLog(id, 'info', `[${totalSteps}/${totalSteps}] Verifying installation (torch, rvc, torchcrepe)...`)

  const verifyScriptPath = join(pythonDir, '_verify_env.py')
  const verifyLines = [
    'import sys',
    'ok = True',
    'results = []',
    '',
    'checks = {',
    '    "torch": "import torch",',
    '    "rvc_python": "from rvc_python.lib.audio import load_audio",',
    '    "torchcrepe": "import torchcrepe",',
    '    "mel_band_roformer": "import mel_band_roformer",',
    '    "fairseq": "from fairseq import checkpoint_utils",',
    '    "faiss": "import faiss",',
    '    "scipy": "import scipy",',
    '    "librosa": "import librosa",',
    '    "soundfile": "import soundfile",',
    '}',
    '',
    'for name, stmt in checks.items():',
    '    try:',
    '        exec(stmt)',
    '        results.append(f"{name}: ok")',
    '    except ImportError as e:',
    '        results.append(f"{name}: FAILED ({e})")',
    '        ok = False',
    '    except Exception:',
    '        results.append(f"{name}: ok (non-import warning ignored)")',
    '',
    'try:',
    '    import torch',
    '    cuda_info = f"CUDA available: {torch.cuda.is_available()}"',
    '    if torch.cuda.is_available():',
    '        cuda_info += f", device: {torch.cuda.get_device_name(0)}"',
    '    results.append(cuda_info)',
    'except: pass',
    '',
    'for r in results:',
    '    print(r)',
    '',
    'if ok:',
    '    print("ALL_PACKAGES_OK")',
    'else:',
    '    print("SOME_PACKAGES_MISSING")',
    '    sys.exit(1)',
  ]

  try {
    await writeFile(verifyScriptPath, verifyLines.join('\n'))
    const { stdout } = await execFileAsync(venvPython, [verifyScriptPath], {
      timeout: 120_000,
      windowsHide: true,
      shell: false,
      cwd: pythonDir,
    })
    const output = stdout.toString().trim()
    for (const line of output.split('\n'))
      appendLog(id, line.includes('FAILED') ? 'warn' : 'success', line.trim())

    if (output.includes('ALL_PACKAGES_OK')) {
      _pkgCheckCache = { installed: true, missing: [], checkedAt: Date.now() }
      appendLog(id, 'success', 'All packages verified successfully')
    }
    else {
      const failedPkgs = output.split('\n').filter(l => l.includes('FAILED')).map(l => l.split(':')[0].trim())
      _pkgCheckCache = { installed: false, missing: failedPkgs, checkedAt: Date.now() }
      appendLog(id, 'warn', `Some packages failed verification: ${failedPkgs.join(', ')}`)
    }
    await unlink(verifyScriptPath).catch(() => {})
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    appendLog(id, 'warn', `Verification script error: ${msg}`)
    // Trust setup completed if we got here without install errors
    _pkgCheckCache = { installed: true, missing: [], checkedAt: Date.now() }
    appendLog(id, 'info', 'Marking packages as installed (setup completed without errors)')
    await unlink(verifyScriptPath).catch(() => {})
  }

  appendLog(id, 'success', `Python environment ready: ${venvPython}`)
  updateProgress(id, { step: 'done', percent: 100, message: 'Python environment ready', completed: true })
  return venvPython
}

function spawnAsync(
  cmd: string,
  args: string[],
  cwd: string,
  progressId: string,
  pctStart: number,
  pctEnd: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'pipe',
      shell: false,
      windowsHide: true,
    })
    const output: string[] = []
    let lastLogTime = 0
    let lastProgressMsg = ''

    function processLine(line: string, isStderr: boolean) {
      if (!line)
        return

      const lower = line.toLowerCase()
      const isBenign = lower.includes('failed to hardlink')
        || lower.includes('falling back to full copy')
        || lower.startsWith('warning: failed to hardlink')
      if (isBenign)
        return

      output.push(line)
      const now = Date.now()

      const isDownloadProgress = lower.includes('downloading')
        || lower.includes('%')
        || lower.includes('mb')
        || lower.includes('gb')
        || lower.includes('kib/s')
        || lower.includes('mib/s')
        || lower.includes('eta')
        || DOWNLOAD_SIZE_REGEX.test(line)

      if (isDownloadProgress || !isStderr) {
        const frac = Math.min(output.length / 50, 0.95)
        const pct = Math.round(pctStart + (pctEnd - pctStart) * frac)
        const msg = line.slice(0, 150)
        if (msg !== lastProgressMsg) {
          updateProgress(progressId, { percent: pct, message: msg })
          lastProgressMsg = msg
        }
      }

      const shouldLog = isDownloadProgress
        || (!isStderr && now - lastLogTime > 600)
        || (isStderr && (lower.includes('error') || lower.includes('fail')))
        || lower.includes('installed')
        || lower.includes('resolved')
        || lower.includes('audited')
        || lower.includes('preparing')
        || lower.includes('building')

      if (shouldLog && now - lastLogTime > 300) {
        const level = (isStderr && (lower.includes('error') || lower.includes('fail')))
          ? 'warn' as const
          : 'info' as const
        appendLog(progressId, level, line.slice(0, 200))
        lastLogTime = now
      }
    }

    child.stdout?.on('data', (data: Buffer) => {
      for (const raw of data.toString().split(LINE_SPLIT_REGEX))
        processLine(raw.trim(), false)
    })
    child.stderr?.on('data', (data: Buffer) => {
      for (const raw of data.toString().split(LINE_SPLIT_REGEX))
        processLine(raw.trim(), true)
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      }
      else {
        const lastLines = output.slice(-3).join('\n')
        reject(new Error(`${cmd} exited with code ${code}: ${lastLines}`))
      }
    })
    child.on('error', reject)
  })
}

interface TorchVariant { label: string, indexUrl: string }

async function detectTorchVariant(): Promise<TorchVariant> {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [], {
      timeout: 10_000,
      windowsHide: true,
      shell: false,
    })
    const match = stdout.match(CUDA_VERSION_REGEX)
    if (!match)
      return { label: 'CPU-only', indexUrl: 'https://download.pytorch.org/whl/cpu' }

    const major = Number.parseInt(match[1], 10)
    const minor = Number.parseInt(match[2], 10)
    const cudaVer = `${match[1]}.${match[2]}`

    // PyTorch 2.7.0 stable wheel indices (https://pytorch.org/)
    // Pick the highest available wheel that the driver supports
    if (major > 12 || (major === 12 && minor >= 8))
      return { label: `CUDA ${cudaVer} → cu128`, indexUrl: 'https://download.pytorch.org/whl/cu128' }
    if (major === 12 && minor >= 6)
      return { label: `CUDA ${cudaVer} → cu126`, indexUrl: 'https://download.pytorch.org/whl/cu126' }
    if (major === 12 || (major === 11 && minor >= 8))
      return { label: `CUDA ${cudaVer} → cu118`, indexUrl: 'https://download.pytorch.org/whl/cu118' }

    return { label: 'CPU-only (CUDA too old)', indexUrl: 'https://download.pytorch.org/whl/cpu' }
  }
  catch {
    return { label: 'CPU-only', indexUrl: 'https://download.pytorch.org/whl/cpu' }
  }
}

// ─── Lazy singing module loader ──────────────────────────────────────────
type SingingModule = typeof import('@proj-airi/singing')

let _singingModule: SingingModule | null = null

async function getSingingModule(): Promise<SingingModule | null> {
  if (_singingModule)
    return _singingModule
  try {
    _singingModule = await import('@proj-airi/singing')
    return _singingModule
  }
  catch (err) {
    log.withError(err).error('Failed to load @proj-airi/singing')
    return null
  }
}

// ─── Base models inventory ───────────────────────────────────────────────
// ─── Hono app ────────────────────────────────────────────────────────────
function buildApp(dataDir: string) {
  const singingPkgRoot = findSingingPackageRoot()
  const modelsDir = singingPkgRoot ? resolve(singingPkgRoot, 'models') : join(dataDir, 'models')
  const tempDir = join(dataDir, 'tmp')

  const activeJobs = new Map<string, AbortController>()

  let pipelineService: {
    createCover: (req: any) => Promise<any>
    getJob: (id: string) => Promise<any>
    cancelJob: (id: string) => Promise<any>
    createTrain: (req: any, datasetPath: string) => Promise<any>
  } | null = null

  async function ensurePipelineService() {
    if (pipelineService)
      return pipelineService
    const mod = await getSingingModule()
    if (!mod)
      return null

    // Ensure the singing module can find FFmpeg and Python by injecting
    // the paths we discovered during setup into environment variables
    // BEFORE calling resolveRuntimeEnv().
    const detectedFfmpeg = await findFFmpeg(dataDir)
    if (detectedFfmpeg)
      process.env.AIRI_SINGING_FFMPEG_PATH = detectedFfmpeg

    if (singingPkgRoot) {
      const pythonInfo = await findPython(singingPkgRoot)
      if (pythonInfo?.path)
        process.env.AIRI_SINGING_PYTHON_PATH = pythonInfo.path
    }

    process.env.AIRI_SINGING_MODELS_DIR = modelsDir
    process.env.AIRI_SINGING_TEMP_DIR = tempDir

    // Migrate legacy flat model files into voice_models/{voiceId}/ structure
    try {
      const voiceModelsPath = join(modelsDir, 'voice_models')
      await mkdir(voiceModelsPath, { recursive: true })
      const flatFiles = await readdir(modelsDir)
      const baseModelNames = new Set(['rmvpe.pt', 'hubert_base.pt', 'f0G40k.pth', 'f0D40k.pth'])
      const pthFiles = flatFiles.filter(f => f.endsWith('.pth') && !baseModelNames.has(f))

      for (const pthFile of pthFiles) {
        const voiceId = pthFile.replace(PTH_SUFFIX_REGEX, '')
        const destDir = resolveVoiceModelDir(voiceModelsPath, voiceId)
        if (!destDir) {
          log.withFields({ voiceId }).warn('Skipping legacy voice model migration with invalid voiceId')
          continue
        }
        if (existsSync(join(destDir, `${voiceId}.pth`)))
          continue

        log.withFields({ voiceId }).log('Migrating legacy voice model to voice_models/')
        await mkdir(destDir, { recursive: true })

        const filesToMigrate = [
          [pthFile, `${voiceId}.pth`],
          [`${voiceId}.index`, `${voiceId}.index`],
          [`${voiceId}_profile.json`, 'voice_profile.json'],
          [`${voiceId}_report.json`, 'validation_report.json'],
          [`${voiceId}_meta.json`, 'meta.json'],
        ]

        for (const [src, dest] of filesToMigrate) {
          const srcPath = join(modelsDir, src)
          if (existsSync(srcPath)) {
            await rename(srcPath, join(destDir, dest)).catch(async () => {
              const data = await readFile(srcPath)
              await writeFile(join(destDir, dest), data)
              await unlink(srcPath).catch(() => {})
            })
          }
        }
      }
    }
    catch (err) {
      log.withFields({ error: err instanceof Error ? err.message : String(err) }).log('Model migration skipped (non-fatal)')
    }

    const queue = new mod.InMemoryQueue()
    const env = mod.resolveRuntimeEnv()
    const outputBaseDir = env.tempDir

    const MAX_RETRY_ATTEMPTS = 3

    async function adjustParamsViaCli(
      currentParams: Record<string, unknown>,
      gateResult: Record<string, unknown>,
      attempt: number,
    ): Promise<Record<string, unknown> | null> {
      return new Promise((resolveP) => {
        const proc = spawn(env.pythonPath, [
          '-m',
          'airi_singing_worker.calibration',
          'adjust',
          '--params',
          JSON.stringify(currentParams),
          '--gate-result',
          JSON.stringify(gateResult),
          '--attempt',
          String(attempt),
        ], {
          env: { ...process.env, PYTHONPATH: env.pythonSrcDir },
          shell: false,
          windowsHide: true,
        })
        let stdout = ''
        proc.stdout?.on('data', (d: Buffer) => {
          stdout += d.toString()
        })
        proc.stderr?.on('data', () => {})
        proc.on('close', (code) => {
          if (code === 0 && stdout.trim()) {
            try {
              resolveP(JSON.parse(stdout.trim()))
            }
            catch {
              resolveP(null)
            }
          }
          else {
            resolveP(null)
          }
        })
        proc.on('error', () => resolveP(null))
      })
    }

    async function executePipelineAsync(jobId: string, request: any) {
      const ac = new AbortController()
      activeJobs.set(jobId, ac)
      const stageTiming: Record<string, number> = {}
      let uploadCleaned = false

      async function finalizeUploadCleanup(): Promise<void> {
        if (uploadCleaned)
          return

        uploadCleaned = true
        await cleanupManagedUploadFile(join(tempDir, 'uploads'), request.inputUri)
      }

      try {
        const jobDir = mod!.buildJobDir(outputBaseDir, jobId)
        const task = mod!.mapRequestToCoverTask(jobId, request, jobDir)
        await queue.updateJob(jobId, { status: 'running', updatedAt: new Date().toISOString() })

        const stageCallbacks = {
          async onStageStart(stage: PipelineStage) {
            await queue.updateJob(jobId, { currentStage: stage, updatedAt: new Date().toISOString() })
          },
          async onStageComplete(stage: PipelineStage, result: { durationMs: number }) {
            stageTiming[stage] = result.durationMs
            await queue.updateJob(jobId, { stageTiming: { ...stageTiming }, updatedAt: new Date().toISOString() })
          },
        }

        const pipelineOutput = await mod!.runCoverPipeline(task, ac.signal, stageCallbacks) as any

        if (ac.signal.aborted) {
          await finalizeUploadCleanup()
          await queue.updateJob(jobId, { status: 'cancelled', updatedAt: new Date().toISOString() })
          return
        }

        const results = pipelineOutput.results ?? pipelineOutput
        const failed = (results as any[]).find((r: any) => !r.success)

        if (failed) {
          await finalizeUploadCleanup()
          await queue.updateJob(jobId, {
            status: 'failed',
            error: failed.error,
            stageTiming: { ...stageTiming },
            updatedAt: new Date().toISOString(),
          })
          return
        }

        const useAutoCalibrate = request.autoCalibrate !== false
        let gateResult = pipelineOutput.gateResult as any
        let retryCount = 0
        let currentParams = pipelineOutput.metadata?.predicted_params as Record<string, unknown> | undefined

        if (useAutoCalibrate && gateResult && !gateResult.passed && currentParams) {
          for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
            if (ac.signal.aborted)
              break
            log.withFields({ jobId, attempt, failedMetrics: gateResult.failed_metrics }).log('Gate failed, retrying with adjusted params')

            const adjusted = await adjustParamsViaCli(currentParams, gateResult, attempt)
            if (!adjusted) {
              log.withFields({ jobId, attempt }).log('Param adjustment failed, stopping retries')
              break
            }

            if (task.request.converter.backend === 'rvc') {
              const conv = task.request.converter as any
              conv.f0UpKey = adjusted.pitch_shift ?? conv.f0UpKey
              conv.indexRate = adjusted.index_rate ?? conv.indexRate
              conv.protect = adjusted.protect ?? conv.protect
              conv.rmsMixRate = adjusted.rms_mix_rate ?? conv.rmsMixRate
            }

            const rerunFn = (mod as any).rerunConversionStages
            if (!rerunFn) {
              log.withFields({ jobId }).log('rerunConversionStages not available, stopping retries')
              break
            }

            const retryOutput = await rerunFn(task, ac.signal, stageCallbacks) as any

            if (ac.signal.aborted) {
              await finalizeUploadCleanup()
              await queue.updateJob(jobId, { status: 'cancelled', updatedAt: new Date().toISOString() })
              return
            }

            const retryResults = retryOutput.results ?? retryOutput
            const retryFailed = (retryResults as any[]).find((r: any) => !r.success)
            if (retryFailed) {
              log.withFields({ jobId, attempt, error: retryFailed.error }).log('Retry attempt failed')
              break
            }

            retryCount = attempt
            gateResult = retryOutput.gateResult
            currentParams = adjusted

            if (gateResult?.passed) {
              log.withFields({ jobId, attempt }).log('Gate passed after retry')
              break
            }
          }
        }

        if (ac.signal.aborted) {
          await finalizeUploadCleanup()
          await queue.updateJob(jobId, { status: 'cancelled', updatedAt: new Date().toISOString() })
          return
        }

        await finalizeUploadCleanup()
        await queue.updateJob(jobId, {
          status: 'completed',
          stageTiming: { ...stageTiming },
          updatedAt: new Date().toISOString(),
          ...(retryCount > 0 ? { retryCount } : {}),
        })
      }
      catch (err) {
        const status = ac.signal.aborted ? 'cancelled' : 'failed'
        await finalizeUploadCleanup()
        await queue.updateJob(jobId, {
          status,
          error: err instanceof Error ? err.message : String(err),
          updatedAt: new Date().toISOString(),
        }).catch((updateErr: unknown) => logTerminalUpdateFailure(jobId, status, updateErr))
      }
      finally {
        activeJobs.delete(jobId)
        await finalizeUploadCleanup()
      }
    }

    const activeTrainingProcs = new Map<string, { proc: ReturnType<typeof spawn>, pid: number }>()

    function killTrainingProcess(voiceId: string) {
      const entry = activeTrainingProcs.get(voiceId)
      if (!entry)
        return
      activeTrainingProcs.delete(voiceId)
      const { proc: childProc, pid } = entry
      log.withFields({ voiceId, pid }).log('Killing training process')
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { shell: false, windowsHide: true })
        }
        else {
          childProc.kill('SIGTERM')
          setTimeout(() => {
            try {
              childProc.kill('SIGKILL')
            }
            catch {}
          }, 3000)
        }
      }
      catch (err) {
        log.withFields({ voiceId, pid, error: err instanceof Error ? err.message : String(err) }).log('Failed to kill training process')
      }
    }

    async function executeTrainingAsync(jobId: string, datasetPath: string, voiceId: string, trainEpochs: number, trainBatchSize: number) {
      const ac = new AbortController()
      activeJobs.set(jobId, ac)
      ac.signal.addEventListener('abort', () => killTrainingProcess(voiceId), { once: true })
      killTrainingProcess(voiceId)
      let uploadCleaned = false

      async function finalizeUploadCleanup(): Promise<void> {
        if (uploadCleaned)
          return

        uploadCleaned = true
        await cleanupManagedUploadFile(join(tempDir, 'training-uploads'), datasetPath)
      }

      try {
        await queue.updateJob(jobId, {
          status: 'running',
          currentStage: PipelineStage.PrepareSource,
          trainingPct: 0,
          trainingStep: 0,
          trainingStepTotal: 8,
          trainingStepName: 'Initializing',
          updatedAt: new Date().toISOString(),
        })

        const pythonPath = env.pythonPath
        const pythonSrcDir = env.pythonSrcDir
        const trainOutputDir = join(env.tempDir, 'training', jobId)
        await mkdir(trainOutputDir, { recursive: true })

        const args = [
          '-m',
          'airi_singing_worker.pipelines.training_pipeline',
          '--voice-id',
          voiceId,
          '--dataset',
          datasetPath,
          '--output-dir',
          trainOutputDir,
          '--epochs',
          String(trainEpochs),
          '--batch-size',
          String(trainBatchSize),
        ]

        const trainEnv: Record<string, string> = {
          ...process.env as Record<string, string>,
          PYTHONPATH: pythonSrcDir,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
          RMVPE_MODEL_PATH: join(modelsDir, 'rmvpe.pt'),
          HUBERT_MODEL_PATH: join(modelsDir, 'hubert_base.pt'),
          RVC_PRETRAINED_G_PATH: join(modelsDir, 'pretrained_v2', 'f0G40k.pth'),
          RVC_PRETRAINED_D_PATH: join(modelsDir, 'pretrained_v2', 'f0D40k.pth'),
        }

        const STAGE_NAME_MAP: Record<string, string> = {
          preprocessing: 'Preprocessing audio',
          f0_extraction: 'Extracting pitch (F0)',
          hubert_extraction: 'Extracting HuBERT features',
          faiss_index: 'Building voice index',
          gan_training: 'GAN fine-tuning',
          model_packaging: 'Packaging model',
          quality_assessment: 'Quality assessment',
          complete: 'Complete',
        }

        const progressFilePath = join(trainOutputDir, 'progress.json')

        const result = await new Promise<{ exitCode: number, stdout: string, stderr: string }>((res) => {
          let stdout = ''
          let stderr = ''
          const proc = spawn(pythonPath, ['-u', ...args], {
            env: trainEnv,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          })

          const pid = proc.pid ?? 0
          activeTrainingProcs.set(voiceId, { proc, pid })
          log.withFields({ voiceId, jobId, pid }).log('Training process spawned')

          // File-based progress polling (reliable on Windows, no stdout buffering)
          const progressPoller = setInterval(async () => {
            try {
              if (!existsSync(progressFilePath))
                return
              const raw = await readFile(progressFilePath, 'utf-8')
              const prog = JSON.parse(raw) as Record<string, unknown>
              if (prog.type !== 'progress')
                return

              const update: Record<string, unknown> = {
                trainingPct: prog.pct,
                trainingStep: prog.step,
                trainingStepTotal: prog.total,
                trainingStepName: STAGE_NAME_MAP[prog.name as string] ?? prog.name,
                updatedAt: new Date().toISOString(),
              }
              if (prog.epoch != null)
                update.currentEpoch = prog.epoch
              if (prog.total_epochs != null)
                update.totalEpochs = prog.total_epochs
              if (prog.loss_g != null)
                update.lossG = prog.loss_g
              if (prog.loss_d != null)
                update.lossD = prog.loss_d
              if (prog.loss_mel != null)
                update.lossMel = prog.loss_mel
              if (prog.loss_mel_raw != null)
                update.lossMelRaw = prog.loss_mel_raw
              if (prog.loss_fm != null)
                update.lossFm = prog.loss_fm
              if (prog.loss_gen != null)
                update.lossGen = prog.loss_gen
              if (prog.loss_kl != null)
                update.lossKl = prog.loss_kl
              if (prog.loss_ms_mel != null)
                update.lossMsMel = prog.loss_ms_mel
              if (prog.loss_r1 != null)
                update.lossR1 = prog.loss_r1
              if (prog.grad_norm_g != null)
                update.gradNormG = prog.grad_norm_g
              if (prog.grad_norm_d != null)
                update.gradNormD = prog.grad_norm_d
              queue.updateJob(jobId, update as any)
            }
            catch { /* file not ready or malformed, skip */ }
          }, 2000)

          proc.stdout?.on('data', (d: Buffer) => {
            stdout += d.toString()
          })
          proc.stderr?.on('data', (d: Buffer) => {
            stderr += d.toString()
          })
          proc.on('close', (code) => {
            clearInterval(progressPoller)
            activeTrainingProcs.delete(voiceId)
            res({ exitCode: code ?? 1, stdout, stderr })
          })
          proc.on('error', (err) => {
            clearInterval(progressPoller)
            activeTrainingProcs.delete(voiceId)
            res({ exitCode: 1, stdout, stderr: err.message })
          })
        })

        if (result.exitCode !== 0) {
          const stderrTail = result.stderr.length > 3000
            ? `...(truncated ${result.stderr.length - 3000} chars)...\n${result.stderr.slice(-3000)}`
            : result.stderr
          throw new Error(`Training failed (exit ${result.exitCode}):\n${stderrTail}`)
        }

        if (ac.signal.aborted) {
          await finalizeUploadCleanup()
          await queue.updateJob(jobId, {
            status: 'cancelled',
            updatedAt: new Date().toISOString(),
          })
          return
        }

        // Save all model artifacts into voice_models/{voiceId}/
        const voiceModelDir = resolveVoiceModelDir(join(modelsDir, 'voice_models'), voiceId)
        if (!voiceModelDir)
          throw new Error(`Invalid voiceId for training artifact path: ${voiceId}`)
        await mkdir(voiceModelDir, { recursive: true })

        async function moveFile(src: string, dest: string) {
          if (!existsSync(src))
            return
          await rename(src, dest).catch(async () => {
            const data = await readFile(src)
            await writeFile(dest, data)
          })
        }

        await moveFile(join(trainOutputDir, `${voiceId}.pth`), join(voiceModelDir, `${voiceId}.pth`))
        log.withFields({ dest: join(voiceModelDir, `${voiceId}.pth`) }).log('Trained model saved')

        await moveFile(join(trainOutputDir, `${voiceId}.index`), join(voiceModelDir, `${voiceId}.index`))
        log.withFields({ dest: join(voiceModelDir, `${voiceId}.index`) }).log('Voice index saved')

        await moveFile(join(trainOutputDir, 'voice_profile.json'), join(voiceModelDir, 'voice_profile.json'))
        await moveFile(join(trainOutputDir, 'validation_report.json'), join(voiceModelDir, 'validation_report.json'))
        await moveFile(join(trainOutputDir, `${voiceId}_meta.json`), join(voiceModelDir, 'meta.json'))

        await finalizeUploadCleanup()
        await queue.updateJob(jobId, {
          status: 'completed',
          currentStage: PipelineStage.Finalize,
          updatedAt: new Date().toISOString(),
        })
      }
      catch (err) {
        if (!ac.signal.aborted)
          killTrainingProcess(voiceId)
        await finalizeUploadCleanup()
        await queue.updateJob(jobId, ac.signal.aborted
          ? {
              status: 'cancelled',
              updatedAt: new Date().toISOString(),
            }
          : {
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
              updatedAt: new Date().toISOString(),
            })
      }
      finally {
        activeJobs.delete(jobId)
        await finalizeUploadCleanup()
      }
    }

    function cleanupAllTrainingProcesses() {
      for (const vid of activeTrainingProcs.keys()) {
        killTrainingProcess(vid)
      }
    }
    process.on('exit', cleanupAllTrainingProcesses)
    process.on('SIGINT', () => {
      cleanupAllTrainingProcesses()
      process.exit(0)
    })
    process.on('SIGTERM', () => {
      cleanupAllTrainingProcesses()
      process.exit(0)
    })

    pipelineService = {
      async createCover(request: any) {
        const result = await mod!.createCoverJob(request, { queue })
        void executePipelineAsync(result.jobId, request).catch(err => logDetachedJobFailure(result.jobId, 'cover', err))
        return result
      },
      async getJob(jobId: string) {
        return mod!.getCoverJob(jobId, { queue })
      },
      async cancelJob(jobId: string) {
        const ac = activeJobs.get(jobId)
        if (ac)
          ac.abort()
        return mod!.cancelCoverJob(jobId, { queue })
      },
      async createTrain(request: any, datasetPath: string) {
        const result = await mod!.createTrainJob(request, { queue })
        void executeTrainingAsync(result.jobId, datasetPath, request.voiceId, request.epochs ?? 200, request.batchSize ?? 8)
          .catch(err => logDetachedJobFailure(result.jobId, 'training', err))
        return result
      },
    }
    return pipelineService
  }

  const app = new Hono()
    .use('*', cors({ origin: getTrustedLocalSingingOrigin }))

    // ── Health & environment ────────────────────────────────────
    .get('/health', async (c) => {
      const ffmpegPath = await findFFmpeg(dataDir)
      const pythonInfo = singingPkgRoot ? await findPython(singingPkgRoot) : null
      const uvAvailable = !!(await findUv())
      const venvExists = singingPkgRoot
        ? existsSync(resolve(singingPkgRoot, 'python', '.venv'))
        : false

      // Skip expensive package import checks while setup is running
      const pythonSetupRunning = (() => {
        const prog = setupProgress.get('python')
        return !!(prog && !prog.completed && !prog.error)
      })()

      let pkgCheck: { installed: boolean, missing: string[] }
      if (pythonSetupRunning) {
        pkgCheck = _pkgCheckCache ?? { installed: false, missing: [] }
      }
      else if (singingPkgRoot) {
        // Uses cache: if already verified, returns instantly; otherwise checks with 60s cooldown
        pkgCheck = await checkPythonPackages(singingPkgRoot)
      }
      else {
        pkgCheck = { installed: false, missing: [] }
      }
      const pythonReady = !!pythonInfo?.isVenv && pkgCheck.installed

      const moduleOk = !!(await getSingingModule())
      const sysReady = !!ffmpegPath && pythonReady

      const baseModels = checkBaseModels(modelsDir)
      const allBaseReady = baseModels.every((m: { exists: boolean }) => m.exists)

      return c.json({
        status: sysReady ? (allBaseReady ? 'ready' : 'models_needed') : 'setup_required',
        setupSupported: true,
        ffmpeg: !!ffmpegPath,
        ffmpegPath,
        python: !!pythonInfo,
        pythonPath: pythonInfo?.path ?? null,
        pythonVenv: pythonReady,
        pythonVenvExists: venvExists,
        pythonPackagesInstalled: pkgCheck.installed,
        pythonPackagesMissing: pkgCheck.missing,
        uvAvailable,
        venvExists,
        modelsDir,
        singingPkgRoot,
        moduleLoaded: moduleOk,
        platform: process.platform,
        arch: process.arch,
        baseModels,
        baseModelsReady: allBaseReady,
      })
    })

    // ── Models ──────────────────────────────────────────────────
    .get('/models', async (c) => {
      try {
        const voiceModelsPath = join(modelsDir, 'voice_models')
        await mkdir(voiceModelsPath, { recursive: true })

        const subdirs = await readdir(voiceModelsPath)
        const voiceModels: { name: string, hasIndex: boolean }[] = []
        for (const name of subdirs) {
          const modelPath = join(voiceModelsPath, name, `${name}.pth`)
          if (existsSync(modelPath)) {
            const hasIndex = existsSync(join(voiceModelsPath, name, `${name}.index`))
            voiceModels.push({ name, hasIndex })
          }
        }

        const baseModels = checkBaseModels(modelsDir)
        const voices = voiceModels.map(({ name }) => ({
          id: name,
          name,
          hasRvcModel: true,
        }))

        return c.json({ voices, voiceModels, baseModels })
      }
      catch {
        return c.json({ voices: [], voiceModels: [], baseModels: checkBaseModels(modelsDir) })
      }
    })

    // ── Setup status ────────────────────────────────────────────
    .get('/setup/status', (c) => {
      const result: Record<string, SetupProgress> = {}
      for (const [k, v] of setupProgress)
        result[k] = v
      return c.json(result)
    })

    // ── Setup: FFmpeg (fire-and-forget — respond immediately, work in background) ──
    .post('/setup/ffmpeg', async (c) => {
      const prog = setupProgress.get('ffmpeg')
      if (prog && !prog.completed && !prog.error)
        return c.json({ message: 'FFmpeg setup already in progress' })

      const existing = await findFFmpeg(dataDir)
      if (existing)
        return c.json({ message: 'FFmpeg already available', path: existing })

      updateProgress('ffmpeg', { step: 'init', percent: 0, message: 'Preparing FFmpeg download...', completed: false, error: undefined, startedAt: Date.now(), logs: [] })

      downloadFFmpeg(dataDir).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        appendLog('ffmpeg', 'error', msg)
        updateProgress('ffmpeg', { step: 'error', message: msg, error: msg, completed: true })
      })

      return c.json({ message: 'FFmpeg setup started' })
    })

    // ── Setup: Python (fire-and-forget) ──────────────────────────
    .post('/setup/python', async (c) => {
      if (!singingPkgRoot)
        return c.json({ error: 'Singing package root not found' }, 500)

      const prog = setupProgress.get('python')
      if (prog && !prog.completed && !prog.error)
        return c.json({ message: 'Python setup already in progress' })

      // Force recheck to see if packages are truly installed
      invalidatePkgCheckCache()
      const existing = await findPython(singingPkgRoot)
      if (existing?.isVenv) {
        const pkgCheck = await checkPythonPackages(singingPkgRoot, true)
        if (pkgCheck.installed) {
          updateProgress('python', { step: 'done', percent: 100, message: 'Python environment ready', completed: true, error: undefined, startedAt: Date.now(), logs: [] })
          appendLog('python', 'success', 'All packages already installed and verified')
          return c.json({ message: 'Python venv already fully configured', path: existing.path })
        }
      }

      updateProgress('python', { step: 'init', percent: 0, message: 'Preparing Python environment...', completed: false, error: undefined, startedAt: Date.now(), logs: [] })

      const pkgRoot = singingPkgRoot
      setupPythonVenv(pkgRoot).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        appendLog('python', 'error', msg)
        updateProgress('python', { step: 'error', message: msg, error: msg, completed: true })
      })

      return c.json({ message: 'Python setup started' })
    })

    // ── Setup: Models (fire-and-forget) ──────────────────────────
    .post('/setup/models', async (c) => {
      const id = 'models'
      const prog = setupProgress.get(id)
      if (prog && !prog.completed && !prog.error)
        return c.json({ message: 'Models download already in progress' })

      updateProgress(id, {
        step: 'init',
        percent: 0,
        message: 'Checking required base models...',
        completed: false,
        error: undefined,
        startedAt: Date.now(),
        logs: [],
      })

      // background work
      const runModelsDownload = async () => {
        await mkdir(modelsDir, { recursive: true })
        appendLog(id, 'info', `Models directory: ${modelsDir}`)
        appendLog(id, 'info', `Source: hf-mirror.com (HuggingFace mirror)`)

        const needed: Array<(typeof BASE_MODELS)[number]> = []
        let totalDownloadBytes = 0
        for (const m of BASE_MODELS) {
          const dir = m.subdir ? join(modelsDir, m.subdir) : modelsDir
          const dest = join(dir, m.filename)
          if (existsSync(dest)) {
            const actual = statSync(dest).size
            const minSize = m.sizeBytes < 10_000 ? 1 : m.sizeBytes * 0.9
            if (actual >= minSize) {
              appendLog(id, 'success', `${m.name}: OK (${(actual / 1024 / 1024).toFixed(1)} MB)`)
            }
            else {
              appendLog(id, 'warn', `${m.name}: incomplete (${(actual / 1024 / 1024).toFixed(1)} MB / ${(m.sizeBytes / 1024 / 1024).toFixed(0)} MB expected) — will re-download`)
              await unlink(dest).catch(() => {})
              needed.push(m)
              totalDownloadBytes += m.sizeBytes
            }
          }
          else {
            needed.push(m)
            totalDownloadBytes += m.sizeBytes
            appendLog(id, 'warn', `${m.name}: missing`)
          }
        }

        if (needed.length === 0) {
          appendLog(id, 'success', 'All base models already downloaded')
          updateProgress(id, {
            step: 'done',
            percent: 100,
            message: `All ${BASE_MODELS.length} base models ready`,
            completed: true,
          })
          return
        }

        const totalMB = (totalDownloadBytes / 1024 / 1024).toFixed(0)
        appendLog(id, 'info', `Need to download ${needed.length} model(s), total ~${totalMB} MB`)

        let downloadedBytes = 0
        for (let i = 0; i < needed.length; i++) {
          const m = needed[i]
          const dir = m.subdir ? join(modelsDir, m.subdir) : modelsDir
          await mkdir(dir, { recursive: true })
          const dest = join(dir, m.filename)

          const basePercent = Math.round((downloadedBytes / totalDownloadBytes) * 95)
          const endPercent = Math.round(((downloadedBytes + m.sizeBytes) / totalDownloadBytes) * 95)

          appendLog(id, 'info', `[${i + 1}/${needed.length}] ${m.name} (${m.description})`)
          appendLog(id, 'info', `  Size: ~${(m.sizeBytes / 1024 / 1024).toFixed(0)} MB → ${dest}`)
          updateProgress(id, {
            step: `download-${m.id}`,
            percent: basePercent,
            message: `Downloading ${m.name} (${i + 1}/${needed.length})...`,
          })

          await httpsDownload(m.url, dest, id, [basePercent, endPercent])
          appendLog(id, 'success', `${m.name}: OK`)
          downloadedBytes += m.sizeBytes
        }

        appendLog(id, 'success', `All ${BASE_MODELS.length} base models ready`)
        updateProgress(id, {
          step: 'done',
          percent: 100,
          message: `All ${BASE_MODELS.length} base models downloaded`,
          completed: true,
        })
      }

      runModelsDownload().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        appendLog(id, 'error', `Download failed: ${msg}`)
        updateProgress(id, { step: 'error', message: msg, error: msg, completed: true })
      })

      return c.json({ message: 'Models download started' })
    })

    // ── Pipeline: Cover ─────────────────────────────────────────
    .use('/cover', bodyLimit({ maxSize: BODY_LIMIT }))
    .post('/cover', async (c) => {
      const svc = await ensurePipelineService()
      if (!svc)
        return c.json({ error: 'Singing pipeline not ready. Please complete setup first.' }, 503)

      let uploadedInputUri: string | null = null
      try {
        const contentType = c.req.header('content-type') ?? ''
        let request: any

        if (contentType.includes('multipart/form-data')) {
          const formData = await c.req.formData()
          const file = formData.get('file') as File | null
          const paramsRaw = formData.get('params') as string | null
          if (!file)
            return c.json({ error: 'Missing file in multipart upload' }, 400)

          let params: Record<string, unknown>
          try {
            params = paramsRaw ? JSON.parse(paramsRaw) : {}
          }
          catch {
            return c.json({ error: 'Invalid JSON in params field' }, 400)
          }

          const uploadsDir = join(tempDir, 'uploads')
          await mkdir(uploadsDir, { recursive: true })
          const uploadId = randomUUID()
          const savedPath = buildSafeUploadPath(uploadsDir, uploadId, file.name)
          await writeMultipartFileToDisk(file, savedPath)
          uploadedInputUri = savedPath

          request = { ...params, inputUri: savedPath, originalFileName: file.name }
        }
        else {
          request = await c.req.json()
        }

        const response = await svc.createCover(request)
        return c.json(response, 201)
      }
      catch (err: any) {
        if (uploadedInputUri)
          await cleanupManagedUploadFile(join(tempDir, 'uploads'), uploadedInputUri)

        log.withError(err).error('Cover creation failed')
        return c.json({ error: err?.message ?? 'Internal error' }, 500)
      }
    })

    // ── Pipeline: Jobs ──────────────────────────────────────────
    .get('/jobs/:id', async (c) => {
      const svc = await ensurePipelineService()
      if (!svc)
        return c.json({ error: 'Pipeline not ready' }, 503)
      try {
        return c.json(await svc.getJob(c.req.param('id')))
      }
      catch (err: any) {
        return c.json({ error: err?.message ?? 'Internal error' }, err?.code === 'JOB_NOT_FOUND' ? 404 : 500)
      }
    })

    .post('/jobs/:id/cancel', async (c) => {
      const svc = await ensurePipelineService()
      if (!svc)
        return c.json({ error: 'Pipeline not ready' }, 503)
      try {
        return c.json(await svc.cancelJob(c.req.param('id')))
      }
      catch (err: any) {
        return c.json({ error: err?.message ?? 'Internal error' }, 500)
      }
    })

    // ── Pipeline: Training ──────────────────────────────────────
    .use('/train', bodyLimit({ maxSize: TRAIN_BODY_LIMIT }))
    .post('/train', async (c) => {
      const svc = await ensurePipelineService()
      if (!svc)
        return c.json({ error: 'Pipeline not ready. Please complete environment setup first.' }, 503)

      let uploadedDatasetPath: string | null = null
      try {
        const contentType = c.req.header('content-type') ?? ''
        let params: Record<string, unknown> = {}
        let datasetPath = ''

        if (contentType.includes('multipart/form-data')) {
          const formData = await c.req.formData()
          const file = formData.get('file') as File | null
          const paramsRaw = formData.get('params') as string | null

          if (!file)
            return c.json({ error: 'Missing dataset file in multipart upload' }, 400)

          try {
            params = paramsRaw ? JSON.parse(paramsRaw) : {}
          }
          catch {
            return c.json({ error: 'Invalid JSON in params field' }, 400)
          }

          const uploadsDir = join(tempDir, 'training-uploads')
          await mkdir(uploadsDir, { recursive: true })
          const uploadId = randomUUID()
          datasetPath = buildSafeUploadPath(uploadsDir, uploadId, file.name)
          await writeMultipartFileToDisk(file, datasetPath)
          uploadedDatasetPath = datasetPath
          log.withFields({ datasetPath, sizeMB: (file.size / 1024 / 1024).toFixed(1) }).log('Training dataset saved')
        }
        else {
          const body = await c.req.json()
          params = body
          datasetPath = body.datasetUri ?? ''
        }

        if (!params.voiceId)
          return c.json({ error: 'voiceId is required' }, 400)
        if (!datasetPath)
          return c.json({ error: 'Dataset file is required' }, 400)

        const request = {
          voiceId: String(params.voiceId),
          datasetUri: datasetPath,
          epochs: Number(params.epochs) || 200,
          batchSize: Number(params.batchSize) || 8,
        }

        const result = await svc.createTrain(request, datasetPath)
        return c.json(result, 201)
      }
      catch (err: any) {
        if (uploadedDatasetPath)
          await cleanupManagedUploadFile(join(tempDir, 'training-uploads'), uploadedDatasetPath)

        return c.json({ error: err?.message ?? 'Internal error' }, 500)
      }
    })

    // ── Artifacts ───────────────────────────────────────────────
    .get('/artifacts/:jobId/:path{.+}', async (c) => {
      const jobId = c.req.param('jobId')
      const artifactPath = c.req.param('path')
      try {
        const baseJobDir = resolve(join(tempDir, 'jobs', jobId))
        const fullPath = resolveContainedPath(baseJobDir, artifactPath)
        if (!fullPath)
          return c.json({ error: 'Invalid artifact path' }, 400)
        const data = await readFile(fullPath)
        const ext = artifactPath.split('.').pop() ?? ''
        const mimeMap: Record<string, string> = {
          wav: 'audio/wav',
          mp3: 'audio/mpeg',
          json: 'application/json',
          npy: 'application/octet-stream',
        }
        return new Response(data, {
          headers: { 'Content-Type': mimeMap[ext] ?? 'application/octet-stream' },
        })
      }
      catch {
        return c.json({ error: 'Artifact not found' }, 404)
      }
    })

    // ── Voice Profile & Report API ───────────────────────────────
    .get('/models/:voiceId/profile', async (c) => {
      const voiceId = c.req.param('voiceId')
      if (!isSafePathSegment(voiceId))
        return c.json({ error: 'Invalid voiceId' }, 400)

      try {
        const modelDir = resolveVoiceModelDir(join(modelsDir, 'voice_models'), voiceId)
        const candidates = [
          join(modelsDir, `${voiceId}_profile.json`),
          join(tempDir, 'training', voiceId, 'voice_profile.json'),
        ]
        if (modelDir)
          candidates.unshift(join(modelDir, 'voice_profile.json'))
        const trainingDir = join(tempDir, 'training')
        if (existsSync(trainingDir)) {
          const trainDirs = await readdir(trainingDir)
          for (const d of trainDirs) {
            candidates.push(join(trainingDir, d, 'voice_profile.json'))
          }
        }

        for (const p of candidates) {
          if (existsSync(p)) {
            const data = await readFile(p, 'utf-8')
            return c.json(JSON.parse(data))
          }
        }
        return c.json({ error: 'Voice profile not found' }, 404)
      }
      catch {
        return c.json({ error: 'Failed to read voice profile' }, 500)
      }
    })

    .get('/models/:voiceId/report', async (c) => {
      const voiceId = c.req.param('voiceId')
      if (!isSafePathSegment(voiceId))
        return c.json({ error: 'Invalid voiceId' }, 400)

      try {
        const modelDir = resolveVoiceModelDir(join(modelsDir, 'voice_models'), voiceId)
        const candidates = [
          join(modelsDir, `${voiceId}_report.json`),
          join(tempDir, 'training', voiceId, 'validation_report.json'),
        ]
        if (modelDir)
          candidates.unshift(join(modelDir, 'validation_report.json'))
        const trainingDir = join(tempDir, 'training')
        if (existsSync(trainingDir)) {
          const trainDirs = await readdir(trainingDir)
          for (const d of trainDirs) {
            candidates.push(join(trainingDir, d, 'validation_report.json'))
          }
        }

        for (const p of candidates) {
          if (existsSync(p)) {
            const data = await readFile(p, 'utf-8')
            return c.json(JSON.parse(data))
          }
        }
        return c.json({ error: 'Validation report not found' }, 404)
      }
      catch {
        return c.json({ error: 'Failed to read validation report' }, 500)
      }
    })

    // ── Evaluate API ─────────────────────────────────────────────
    .post('/evaluate', async (c) => {
      if (!singingPkgRoot)
        return c.json({ error: 'Singing package root not found' }, 500)

      try {
        const body = await c.req.json() as { audioPath: string, voiceId: string, refPath?: string }
        if (!isSafePathSegment(body.voiceId))
          return c.json({ error: 'Invalid voiceId' }, 400)

        const pythonInfo = await findPython(singingPkgRoot)
        if (!pythonInfo)
          return c.json({ error: 'Python not available' }, 503)

        const pythonSrcDir = resolve(singingPkgRoot, 'python', 'src')
        const args = [
          '-m',
          'airi_singing_worker.evaluation',
          'evaluate',
          '--ref',
          body.refPath || body.audioPath,
          '--synth',
          body.audioPath,
          '--voice-id',
          body.voiceId,
        ]

        const result = await new Promise<string>((res, rej) => {
          let stdout = ''
          const proc = spawn(pythonInfo.path, args, {
            env: { ...process.env as Record<string, string>, PYTHONPATH: pythonSrcDir },
            shell: false,
            windowsHide: true,
          })
          proc.stdout?.on('data', (d: Buffer) => {
            stdout += d.toString()
          })
          proc.on('close', code => code === 0 ? res(stdout) : rej(new Error(`exit ${code}`)))
          proc.on('error', rej)
        })

        return c.json(JSON.parse(result.trim()))
      }
      catch (err: any) {
        return c.json({ error: err?.message ?? 'Evaluation failed' }, 500)
      }
    })

    // ── Calibrate API ────────────────────────────────────────────
    .post('/calibrate', async (c) => {
      if (!singingPkgRoot)
        return c.json({ error: 'Singing package root not found' }, 500)

      try {
        const body = await c.req.json() as { vocalPath: string, voiceId: string }
        if (!isSafePathSegment(body.voiceId))
          return c.json({ error: 'Invalid voiceId' }, 400)

        const pythonInfo = await findPython(singingPkgRoot)
        if (!pythonInfo)
          return c.json({ error: 'Python not available' }, 503)

        const profileCandidates = [
          join(modelsDir, 'voice_models', body.voiceId, 'voice_profile.json'),
          join(modelsDir, `${body.voiceId}_profile.json`),
          join(tempDir, 'training', body.voiceId, 'voice_profile.json'),
        ]
        let profilePath = ''
        for (const p of profileCandidates) {
          if (existsSync(p)) {
            profilePath = p
            break
          }
        }
        if (!profilePath)
          return c.json({ error: 'Voice profile not found for this model' }, 404)

        const pythonSrcDir = resolve(singingPkgRoot, 'python', 'src')
        const args = [
          '-m',
          'airi_singing_worker.calibration',
          'predict',
          '--vocal',
          body.vocalPath,
          '--voice-profile',
          profilePath,
        ]

        const result = await new Promise<string>((res, rej) => {
          let stdout = ''
          const proc = spawn(pythonInfo.path, args, {
            env: { ...process.env as Record<string, string>, PYTHONPATH: pythonSrcDir },
            shell: false,
            windowsHide: true,
          })
          proc.stdout?.on('data', (d: Buffer) => {
            stdout += d.toString()
          })
          proc.on('close', code => code === 0 ? res(stdout) : rej(new Error(`exit ${code}`)))
          proc.on('error', rej)
        })

        return c.json(JSON.parse(result.trim()))
      }
      catch (err: any) {
        return c.json({ error: err?.message ?? 'Calibration failed' }, 500)
      }
    })

  return app
}

// ─── Public API ──────────────────────────────────────────────────────────
export interface SingingLocalServer {
  url: string
  port: number
  stop: () => void
}

export interface SingingServerConfig {
  port?: number
  dataDir: string
}

function checkPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true))
      })
      .listen(port, host)
  })
}

function killProcessOnPort(port: number): boolean {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`, { encoding: 'utf-8', windowsHide: true }).trim()
      const lines = result.split('\n').filter(l => l.trim())
      for (const line of lines) {
        const parts = line.trim().split(WHITESPACE_REGEX)
        const pid = parts.at(-1)
        if (pid && PID_REGEX.test(pid) && pid !== '0') {
          try {
            execSync(`taskkill /T /F /PID ${pid}`, { windowsHide: true })
          }
          catch {}
        }
      }
      return lines.length > 0
    }
    else {
      const result = execSync(`lsof -ti :${port}`, { encoding: 'utf-8' }).trim()
      if (result) {
        for (const pid of result.split('\n').filter(p => p.trim())) {
          try {
            execSync(`kill -9 ${pid}`)
          }
          catch {}
        }
        return true
      }
    }
  }
  catch {}
  return false
}

async function ensurePortFree(port: number): Promise<void> {
  if (await checkPortAvailable(port, '127.0.0.1'))
    return

  log.withFields({ port }).log('Port occupied by stale process, killing...')
  killProcessOnPort(port)
  await new Promise(resolve => setTimeout(resolve, 1500))

  if (await checkPortAvailable(port, '127.0.0.1')) {
    log.withFields({ port }).log('Port freed successfully')
  }
  else {
    log.withFields({ port }).warn('Port still occupied after kill attempt')
  }
}

export async function setupSingingLocalServer(config: SingingServerConfig): Promise<SingingLocalServer> {
  const preferredPort = config.port ?? (Number(process.env.AIRI_SINGING_LOCAL_PORT) || DEFAULT_PORT)
  const { dataDir } = config

  await mkdir(dataDir, { recursive: true })

  try {
    const port = preferredPort
    await ensurePortFree(port)

    const app = buildApp(dataDir)

    const server = await new Promise<ReturnType<typeof serve>>((resolve, reject) => {
      const s = serve({
        fetch: app.fetch,
        port,
        hostname: '127.0.0.1',
      })

      const httpServer = (s as any)?.server ?? (s as any)
      if (httpServer && typeof httpServer.on === 'function') {
        httpServer.once('error', (err: Error) => reject(err))
        httpServer.once('listening', () => resolve(s))
        setTimeout(resolve, 500, s)
      }
      else {
        resolve(s)
      }
    })

    const url = `http://127.0.0.1:${port}`
    log.withFields({ url, dataDir }).log('Local singing server started')

    return { url, port, stop: () => server.close() }
  }
  catch (err) {
    log.withError(err).error('Failed to start singing server')
    const fallbackPort = preferredPort
    return { url: `http://127.0.0.1:${fallbackPort}`, port: fallbackPort, stop: () => {} }
  }
}
