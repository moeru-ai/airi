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

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { env, exit, kill as killProcess } from 'node:process'
import { fileURLToPath } from 'node:url'

import { errorMessageFromValue } from '@proj-airi/stage-shared'

import { CdpClient, findAvailablePort, findDebugTarget, isRecord, sleep, waitForRemoteDebug } from './lib/remote-debug'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = resolve(packageDir, '../..')
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const reportDir = resolve(repoDir, '.temp', `linux-window-render-smoke-${runId}`)
const userDataDir = resolve(reportDir, 'stage-user-data')
const screenshotPath = resolve(reportDir, 'main-window.png')

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

function startStage(debugPort: number, inspectPort: number): ChildProcessWithoutNullStreams {
  return spawn('pnpm', ['-F', '@proj-airi/stage-tamagotchi', 'start'], {
    cwd: repoDir,
    detached: true,
    env: {
      ...env,
      APP_REMOTE_DEBUG: 'true',
      APP_REMOTE_DEBUG_PORT: String(debugPort),
      APP_REMOTE_DEBUG_NO_OPEN: 'true',
      APP_USER_DATA_PATH: userDataDir,
      // electron-vite's `preview` command runs in production mode, where it
      // ignores its own V8_INSPECTOR_PORT convenience env var (that's gated
      // to dev mode). ELECTRON_CLI_ARGS is not gated, so use it to pass
      // Electron's native `--inspect` flag through instead. This opens a
      // Node inspector on the main process, letting the smoke check below
      // read real BrowserWindow state (isVisible()) rather than only the
      // renderer's DOM.
      ELECTRON_CLI_ARGS: JSON.stringify([`--inspect=${inspectPort}`]),
    },
    stdio: 'pipe',
  })
}

async function stopStage(stageProcess: ChildProcessWithoutNullStreams | undefined) {
  if (!stageProcess || stageProcess.exitCode !== null)
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
  await Promise.race([
    new Promise(resolve => stageProcess.once('exit', resolve)),
    sleep(5_000).then(() => signalStageProcessGroup('SIGKILL')),
  ])
}

function rejectWhenStageExits(stageProcess: ChildProcessWithoutNullStreams): Promise<never> {
  return new Promise((_, reject) => {
    let output = ''
    stageProcess.stdout.on('data', chunk => output += chunk.toString('utf-8'))
    stageProcess.stderr.on('data', chunk => output += chunk.toString('utf-8'))
    stageProcess.once('exit', (code, signal) => {
      reject(new Error(`stage-tamagotchi exited with code=${String(code)} signal=${String(signal)}\n${output.slice(-4000)}`))
    })
  })
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

async function findMainProcessInspectorTarget(inspectPort: number) {
  // Node's inspector HTTP API exposes exactly one target for the process
  // it's attached to; unlike Electron's Chrome DevTools endpoint, its
  // `/json/version` response carries no webSocketDebuggerUrl, so this reads
  // `/json/list` instead of using waitForRemoteDebug.
  return await findDebugTarget(inspectPort, 'main process inspector target', () => true)
}

interface RenderCheck {
  readyState: DocumentReadyState
  appRootChildCount: number
  bodyTextLength: number
}

interface MainWindowVisibilityCheck {
  found: boolean
  isVisible: boolean
}

async function main() {
  let stageProcess: ChildProcessWithoutNullStreams | undefined
  let client: CdpClient | undefined
  let inspectorClient: CdpClient | undefined

  try {
    await ensureSmokePrerequisites()
    await mkdir(reportDir, { recursive: true })

    const debugPort = await findAvailablePort()
    const inspectPort = await findAvailablePort()
    stageProcess = startStage(debugPort, inspectPort)
    const stageExited = rejectWhenStageExits(stageProcess)

    await Promise.race([waitForRemoteDebug(debugPort), stageExited]).catch((error) => {
      throw new Error(`APP_START_FAILED: ${errorMessageFromValue(error)}`)
    })

    const mainWindowTarget = await Promise.race([findMainWindowTarget(debugPort), stageExited]).catch((error) => {
      throw new Error(`APP_START_FAILED: ${errorMessageFromValue(error)}`)
    })
    if (!mainWindowTarget.webSocketDebuggerUrl)
      throw new Error('APP_START_FAILED: main window target missing webSocketDebuggerUrl')

    client = await CdpClient.connect(mainWindowTarget.webSocketDebuggerUrl)

    // Vue mounts asynchronously after the initial document load; give it a
    // moment before asserting on rendered DOM rather than racing it.
    await sleep(1_500)

    const check = await client.evaluate<RenderCheck>(`(() => {
      const root = document.querySelector('#app')
      return {
        readyState: document.readyState,
        appRootChildCount: root ? root.children.length : -1,
        bodyTextLength: document.body ? document.body.innerText.length : 0,
      }
    })()`)

    if (check.readyState !== 'complete')
      throw new Error(`RENDER_CHECK_FAILED: document.readyState=${check.readyState}`)
    if (check.appRootChildCount <= 0)
      throw new Error(`RENDER_CHECK_FAILED: #app root has no children (appRootChildCount=${check.appRootChildCount}). The window likely came up blank.`)

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' })
    const screenshotData = isRecord(screenshot.result) ? screenshot.result.data : undefined
    if (typeof screenshotData !== 'string' || screenshotData.length === 0)
      throw new Error('RENDER_CHECK_FAILED: Page.captureScreenshot returned no image data')
    await writeFile(screenshotPath, Buffer.from(screenshotData, 'base64'))

    // The renderer checks above pass even for a hidden window (show: false,
    // ready-to-show never firing): CDP still exposes and can screenshot a
    // renderer that is attached to a native window the user never sees.
    // Ask the main process itself, over its Node inspector, whether the
    // BrowserWindow actually became visible.
    const inspectorTarget = await Promise.race([findMainProcessInspectorTarget(inspectPort), stageExited]).catch((error) => {
      throw new Error(`APP_START_FAILED: ${errorMessageFromValue(error)}`)
    })
    if (!inspectorTarget.webSocketDebuggerUrl)
      throw new Error('APP_START_FAILED: main process inspector target missing webSocketDebuggerUrl')

    inspectorClient = await CdpClient.connect(inspectorTarget.webSocketDebuggerUrl)
    const visibility = await inspectorClient.evaluate<MainWindowVisibilityCheck>(`(async () => {
      const { BrowserWindow } = await import('electron')
      const window = BrowserWindow.getAllWindows().find((candidate) => candidate.getTitle() === 'AIRI')
      return {
        found: Boolean(window),
        isVisible: window ? window.isVisible() : false,
      }
    })()`)

    if (!visibility.found)
      throw new Error('RENDER_CHECK_FAILED: no BrowserWindow titled \'AIRI\' exists in the main process')
    if (!visibility.isVisible)
      throw new Error('RENDER_CHECK_FAILED: the AIRI BrowserWindow exists but BrowserWindow.isVisible() is false')

    console.info(JSON.stringify({
      ok: true,
      reportDir,
      screenshotPath,
      check,
      visibility,
    }, null, 2))
  }
  finally {
    inspectorClient?.close()
    client?.close()
    await stopStage(stageProcess)
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(errorMessageFromValue(error))
    exit(1)
  })
}
