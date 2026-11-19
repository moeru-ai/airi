/**
 * Boots the real, built Electron app and asserts that the main window
 * actually renders content — not just that the process starts.
 *
 * This exists because Linux desktop breakage (frameless/transparent window
 * config, the Ozone/X11 vs Wayland command-line switches in
 * `src/main/index.ts` and `src/main/app/ozone.ts`, GPU sandboxing under
 * Xvfb) has historically only surfaced when a contributor happened to run
 * the app on their own Linux desktop. CI only compiled the app; nothing
 * launched it. Run this under `xvfb-run` in CI so it exercises the same
 * X11/Ozone code path most Linux users hit through XWayland.
 *
 * This intentionally does not drive the app through `computer_use` MCP the
 * way `desktop-overlay-live-window-smoke.ts` does — that requires a
 * platform executor (only `macos-local` and a remote SSH-bound
 * `linux-x11` runner exist today) that a plain CI runner cannot satisfy.
 * The bar here is lower and cheaper to keep green: did a window appear and
 * did the renderer mount real DOM. It also confirms the native
 * `BrowserWindow` itself became visible, not only that its renderer
 * mounted — a hidden window (`show: false`, `ready-to-show` never firing)
 * still exposes a CDP target and would otherwise pass the DOM check alone.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { WriteStream } from 'node:fs'

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { arch, platform, release } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { env, exit, kill as killProcess, version as nodeVersion } from 'node:process'
import { fileURLToPath } from 'node:url'

// NOTICE: do not import the stage-shared barrel here. It re-exports
// environment.ts, which reads `import.meta.env` at module scope. tsx runs
// this script outside Vite, so `import.meta.env` is undefined and the
// import crashes before the smoke starts (see PR #2519 CI failure). Use
// @moeru/std directly instead.
import { errorMessageFrom } from '@moeru/std'

import { CdpClient, fetchJson, findAvailablePort, findDebugTarget, isRecord, sleep, waitFor, waitForRemoteDebug } from './lib/remote-debug'

function errorMessageFromValue(error: unknown): string {
  return errorMessageFrom(error) ?? String(error)
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = resolve(packageDir, '../..')
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
// CI sets SMOKE_REPORT_DIR to a non-hidden path so actions/upload-artifact
// picks it up; `.temp/` is skipped by upload-artifact's hidden-file filter,
// which is why earlier failing runs uploaded nothing to diagnose.
const reportDir = env.SMOKE_REPORT_DIR?.trim()
  ? resolve(env.SMOKE_REPORT_DIR.trim())
  : resolve(repoDir, '.temp', `linux-window-render-smoke-${runId}`)
const userDataDir = resolve(reportDir, 'stage-user-data')
const screenshotPath = resolve(reportDir, 'main-window.png')
const stageLogPath = resolve(reportDir, 'stage.log')
const reportPath = resolve(reportDir, 'report.json')

/**
 * Ozone backend the caller expects Chromium to pick (`x11` or `wayland`).
 * When set, the smoke fails unless every Electron child process that
 * carries `--ozone-platform` uses this value, so the Wayland job cannot pass
 * through an XWayland fallback and the X11 job cannot drift to Wayland.
 */
const expectedOzonePlatform = env.SMOKE_EXPECT_OZONE_PLATFORM?.trim() || undefined

/**
 * Time budget for the renderer to mount `#app` and become visible after its
 * CDP target appears. Vue mounts asynchronously and cold GPU init under
 * Xvfb/Weston is slow on shared runners, so this polls instead of sleeping
 * for a fixed interval.
 */
const renderCheckTimeoutMs = 60_000
const renderCheckIntervalMs = 500

const requiredWorkspaceBuildOutputs = [
  'packages/electron-screen-capture/dist/main.mjs',
  'packages/electron-vueuse/dist/main/index.mjs',
  'packages/server-runtime/dist/server.mjs',
]

async function ensureSmokePrerequisites() {
  if (typeof WebSocket !== 'function') {
    throw new TypeError('APP_START_FAILED: WebSocket is unavailable in this Node runtime. Run through the package script or set NODE_OPTIONS=--experimental-websocket.')
  }

  const missingOutputs: string[] = []
  for (const relativePath of requiredWorkspaceBuildOutputs) {
    try {
      await access(resolve(repoDir, relativePath))
    }
    catch {
      missingOutputs.push(relativePath)
    }
  }

  if (missingOutputs.length === 0)
    return

  throw new Error([
    'APP_START_FAILED: required workspace build outputs are missing.',
    `Missing: ${missingOutputs.join(', ')}`,
    'Build stage-tamagotchi dependencies before this smoke.',
    'Suggested command: pnpm -F \'@proj-airi/stage-tamagotchi^...\' --if-present build',
  ].join(' '))
}

function startStage(debugPort: number): ChildProcessWithoutNullStreams {
  // Keeps the run hermetic: a fresh user-data dir per run means no persisted
  // onboarding state, window bounds, or provider config leak between runs.
  return spawn('pnpm', ['-F', '@proj-airi/stage-tamagotchi', 'start'], {
    cwd: repoDir,
    detached: true,
    env: {
      ...env,
      APP_REMOTE_DEBUG: 'true',
      APP_REMOTE_DEBUG_PORT: String(debugPort),
      APP_REMOTE_DEBUG_NO_OPEN: 'true',
      APP_USER_DATA_PATH: userDataDir,
    },
    stdio: 'pipe',
  })
}

function isProcessGroupAlive(pid: number): boolean {
  try {
    killProcess(-pid, 0)
    return true
  }
  catch {
    return false
  }
}

async function stopStage(stageProcess: ChildProcessWithoutNullStreams | undefined) {
  if (!stageProcess)
    return

  // NOTICE:
  // The pnpm wrapper can exit while Electron children still run in its
  // process group (CI logged "Terminate orphan process: electron"). Check
  // the group, not the wrapper's exit code, so no Electron outlives the smoke.
  const groupAlive = stageProcess.pid !== undefined && isProcessGroupAlive(stageProcess.pid)
  if (stageProcess.exitCode !== null && !groupAlive)
    return

  const signalStageProcessGroup = (signal: NodeJS.Signals) => {
    try {
      if (stageProcess.pid) {
        killProcess(-stageProcess.pid, signal)
        return
      }
    }
    catch {
      // Fall back to the direct process handle if process-group signalling
      // is unavailable on this platform.
    }

    stageProcess.kill(signal)
  }

  signalStageProcessGroup('SIGTERM')
  const pid = stageProcess.pid
  if (pid === undefined) {
    await Promise.race([
      new Promise(resolve => stageProcess.once('exit', resolve)),
      sleep(5_000).then(() => signalStageProcessGroup('SIGKILL')),
    ])
    return
  }

  await waitFor('stage process group exit', () => isProcessGroupAlive(pid) ? undefined : true, 5_000, 100)
    .catch(() => signalStageProcessGroup('SIGKILL'))
}

/**
 * Streams the full stage stdout/stderr into `stage.log` (uploaded as a CI
 * artifact) and rejects if the stage exits before the smoke finishes. Only
 * the tail is inlined into the error so the job log stays readable.
 */
function rejectWhenStageExits(stageProcess: ChildProcessWithoutNullStreams, log: WriteStream): Promise<never> {
  const promise = new Promise<never>((_, reject) => {
    let tail = ''
    const collect = (chunk: Buffer) => {
      log.write(chunk)
      tail = (tail + chunk.toString('utf-8')).slice(-4000)
    }
    stageProcess.stdout.on('data', collect)
    stageProcess.stderr.on('data', collect)
    stageProcess.once('exit', (code, signal) => {
      reject(new Error(`stage-tamagotchi exited with code=${String(code)} signal=${String(signal)}\n${tail}`))
    })
  })
  // Callers race this against each phase; a late exit during cleanup must
  // not surface as an unhandled rejection.
  promise.catch(() => {})
  return promise
}

async function findMainWindowTarget(debugPort: number) {
  // The main window is the only eagerly-created window loaded at its
  // hash-router root ('/'); every other window (settings, chat, onboarding,
  // desktop-overlay, ...) loads a nested route.
  return await findDebugTarget(
    debugPort,
    'main window debug target',
    target => target.type === 'page' && /#\/?$/.test(target.url),
  )
}

interface RenderCheck {
  readyState: DocumentReadyState
  appRootChildCount: number
  bodyTextLength: number
  visibilityState: DocumentVisibilityState
  innerWidth: number
  innerHeight: number
  devicePixelRatio: number
}

const renderCheckExpression = `(() => {
  const root = document.querySelector('#app')
  return {
    readyState: document.readyState,
    appRootChildCount: root ? root.children.length : -1,
    bodyTextLength: document.body ? document.body.innerText.length : 0,
    visibilityState: document.visibilityState,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  }
})()`

/**
 * Returns why the window does not count as rendered yet, or undefined once
 * it does. Used both as the polling predicate and as the final failure
 * message so the reported reason is the last one actually observed.
 */
function renderCheckFailure(check: RenderCheck): string | undefined {
  if (check.readyState !== 'complete')
    return `document.readyState=${check.readyState}`
  if (check.appRootChildCount <= 0)
    return `#app root has no children (appRootChildCount=${check.appRootChildCount}). The window likely came up blank.`
  // A hidden window (ready-to-show never fired) still passes the DOM checks
  // over CDP, but Chromium reports it as visibilityState='hidden'. The
  // main-process BrowserWindow.isVisible() is unreachable: its inspector
  // cannot import() the ESM main bundle.
  if (check.visibilityState !== 'visible')
    return `document.visibilityState=${check.visibilityState}; the window is not visible`
  if (check.innerWidth <= 0 || check.innerHeight <= 0)
    return `window has no area (${check.innerWidth}x${check.innerHeight})`
  return undefined
}

interface RendererDiagnostic {
  kind: 'console' | 'exception'
  level: string
  text: string
}

/**
 * Records renderer console warnings/errors and uncaught exceptions into the
 * report. They do not fail the smoke on their own (a missing provider key
 * logs errors on a fresh profile), but they are usually the first clue when
 * the window does come up blank. `Runtime.enable` replays messages logged
 * before the client attached, so early boot errors are captured too.
 */
async function collectRendererDiagnostics(client: CdpClient, diagnostics: RendererDiagnostic[]) {
  client.on('Runtime.consoleAPICalled', (params) => {
    const level = typeof params.type === 'string' ? params.type : 'log'
    if (level !== 'error' && level !== 'warning' && level !== 'assert')
      return
    const args = Array.isArray(params.args) ? params.args : []
    const text = args
      .map(arg => isRecord(arg) ? String(arg.value ?? arg.description ?? '') : '')
      .join(' ')
    diagnostics.push({ kind: 'console', level, text })
  })
  client.on('Runtime.exceptionThrown', (params) => {
    const details = isRecord(params.exceptionDetails) ? params.exceptionDetails : {}
    const exception = isRecord(details.exception) ? details.exception : {}
    const text = String(exception.description ?? details.text ?? 'unknown exception')
    diagnostics.push({ kind: 'exception', level: 'error', text })
  })
  await client.send('Runtime.enable')
}

interface StageProcess {
  pid: number
  executable: string
  /** Chromium `--type=` (gpu-process, renderer, zygote, utility); absent for the browser process and wrappers. */
  type?: string
  ozonePlatform?: string
}

/**
 * Lists the processes in the stage process group with the Chromium switches
 * that identify which display backend each one ran. The browser process
 * resolves `ozone-platform-hint=auto` and forwards a concrete
 * `--ozone-platform` to its children, so this shows the backend that was
 * actually used rather than the one requested. Linux-only (`/proc`);
 * returns an empty list when nothing could be read.
 */
async function readStageProcesses(processGroupId: number): Promise<StageProcess[]> {
  let entries: string[]
  try {
    entries = await readdir('/proc')
  }
  catch {
    return []
  }

  const processes: StageProcess[] = []
  for (const entry of entries) {
    if (!/^\d+$/.test(entry))
      continue
    try {
      // /proc/<pid>/stat is "pid (comm) state ppid pgrp ...". comm may
      // contain spaces or ')', so split after the last ')': index 2 is pgrp.
      const stat = await readFile(join('/proc', entry, 'stat'), 'utf-8')
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      if (Number(fields[2]) !== processGroupId)
        continue
      // Chromium rewrites its process title, so child cmdlines are one
      // space-joined string instead of NUL-separated argv. Split on both;
      // the switches read here never contain spaces.
      const argv = (await readFile(join('/proc', entry, 'cmdline'), 'utf-8')).split(/[\0 ]/).filter(Boolean)
      const switchValue = (name: string) => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
      processes.push({
        pid: Number(entry),
        executable: argv[0] ?? '',
        type: switchValue('type'),
        ozonePlatform: switchValue('ozone-platform'),
      })
    }
    catch {
      // The process exited between readdir and read; skip it.
    }
  }
  return processes.sort((left, right) => left.pid - right.pid)
}

async function readBrowserVersion(debugPort: number): Promise<Record<string, unknown> | undefined> {
  try {
    return await fetchJson<Record<string, unknown>>(`http://127.0.0.1:${debugPort}/json/version`)
  }
  catch {
    return undefined
  }
}

/**
 * Runtime facts that decide which Linux code path ran. Recorded in every
 * report so a CI failure can be replayed locally with the same display
 * server, session type, and toolchain.
 */
function describeEnvironment() {
  return {
    node: nodeVersion,
    platform: platform(),
    arch: arch(),
    kernel: release(),
    display: env.DISPLAY,
    waylandDisplay: env.WAYLAND_DISPLAY,
    xdgSessionType: env.XDG_SESSION_TYPE,
    electronDisableSandbox: env.ELECTRON_DISABLE_SANDBOX,
    lang: env.LANG,
    tz: env.TZ,
    expectedOzonePlatform,
  }
}

async function main() {
  let stageProcess: ChildProcessWithoutNullStreams | undefined
  let client: CdpClient | undefined
  let stageLog: WriteStream | undefined

  // Written on success and on failure; `phase` tells which step failed.
  const report: Record<string, unknown> = {
    ok: false,
    phase: 'prerequisites',
    reportDir,
    environment: describeEnvironment(),
  }
  const rendererDiagnostics: RendererDiagnostic[] = []
  report.rendererDiagnostics = rendererDiagnostics

  try {
    await ensureSmokePrerequisites()
    await mkdir(reportDir, { recursive: true })
    stageLog = createWriteStream(stageLogPath)

    report.phase = 'launch'
    const debugPort = await findAvailablePort()
    stageProcess = startStage(debugPort)
    const stageExited = rejectWhenStageExits(stageProcess, stageLog)

    await Promise.race([waitForRemoteDebug(debugPort), stageExited]).catch((error) => {
      throw new Error(`APP_START_FAILED: ${errorMessageFromValue(error)}`)
    })
    report.browserVersion = await readBrowserVersion(debugPort)

    report.phase = 'find-main-window'
    const mainWindowTarget = await Promise.race([findMainWindowTarget(debugPort), stageExited]).catch((error) => {
      throw new Error(`APP_START_FAILED: ${errorMessageFromValue(error)}`)
    })
    if (!mainWindowTarget.webSocketDebuggerUrl)
      throw new Error('APP_START_FAILED: main window target missing webSocketDebuggerUrl')

    client = await CdpClient.connect(mainWindowTarget.webSocketDebuggerUrl)
    await collectRendererDiagnostics(client, rendererDiagnostics)

    report.phase = 'render-check'
    let lastCheck: RenderCheck | undefined
    const renderedClient = client
    const check = await Promise.race([
      waitFor('main window render', async () => {
        lastCheck = await renderedClient.evaluate<RenderCheck>(renderCheckExpression)
        return renderCheckFailure(lastCheck) === undefined ? lastCheck : undefined
      }, renderCheckTimeoutMs, renderCheckIntervalMs),
      stageExited,
    ]).catch((error) => {
      // Report both the wait/exit error and the last condition that was
      // actually observed, so a timeout says *what* never became true.
      report.check = lastCheck
      const lastFailure = lastCheck ? renderCheckFailure(lastCheck) : 'renderer never answered Runtime.evaluate'
      throw new Error(`RENDER_CHECK_FAILED: ${lastFailure} (${errorMessageFromValue(error)})`)
    })
    report.check = check

    report.phase = 'ozone-platform'
    const stageProcesses = stageProcess.pid !== undefined ? await readStageProcesses(stageProcess.pid) : []
    const ozonePlatforms = [...new Set(stageProcesses.flatMap(process => process.ozonePlatform ? [process.ozonePlatform] : []))].sort()
    report.stageProcesses = stageProcesses
    report.ozonePlatforms = ozonePlatforms
    // An empty list fails too: if the process scan stops finding switches
    // (Chromium changes its title format), the check must not pass silently.
    if (expectedOzonePlatform && (ozonePlatforms.length !== 1 || ozonePlatforms[0] !== expectedOzonePlatform))
      throw new Error(`OZONE_PLATFORM_MISMATCH: expected ${expectedOzonePlatform}, Electron child processes ran with [${ozonePlatforms.join(', ')}]`)

    report.phase = 'screenshot'
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' })
    const screenshotData = isRecord(screenshot.result) ? screenshot.result.data : undefined
    if (typeof screenshotData !== 'string' || screenshotData.length === 0)
      throw new Error('RENDER_CHECK_FAILED: Page.captureScreenshot returned no image data')
    await writeFile(screenshotPath, Buffer.from(screenshotData, 'base64'))
    report.screenshotPath = screenshotPath

    report.phase = 'done'
    report.ok = true
  }
  catch (error) {
    report.error = errorMessageFromValue(error)
    throw error
  }
  finally {
    client?.close()
    await stopStage(stageProcess)
    stageLog?.end()
    // Create the dir in case prerequisites failed before it existed. A
    // failed report write must not mask the smoke's own error.
    await mkdir(reportDir, { recursive: true })
      .then(() => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`))
      .catch(() => {})
    console.info(JSON.stringify(report, null, 2))
  }
}

// NOTICE:
// No `if (import.meta.main)` guard. It is undefined on Node < 24.2, so the
// guarded smoke exited 0 without launching anything. Nothing imports this
// file, so the guard protected nothing.
// Removal condition: none; keep this file a pure entrypoint.
main().catch((error) => {
  console.error(errorMessageFromValue(error))
  exit(1)
})
