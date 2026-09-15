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

// NOTICE: do not import the stage-shared barrel here. It re-exports
// environment.ts, which reads `import.meta.env` at module scope. tsx runs
// this script outside Vite, so `import.meta.env` is undefined and the
// import crashes before the smoke starts (see PR #2519 CI failure). Use
// @moeru/std directly instead.
import { errorMessageFrom } from '@moeru/std'

import { CdpClient, findAvailablePort, findDebugTarget, isRecord, sleep, waitForRemoteDebug } from './lib/remote-debug'

function errorMessageFromValue(error: unknown): string {
  return errorMessageFrom(error) ?? String(error)
}

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

function startStage(debugPort: number): ChildProcessWithoutNullStreams {
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

interface RenderCheck {
  readyState: DocumentReadyState
  appRootChildCount: number
  bodyTextLength: number
  visibilityState: DocumentVisibilityState
}

async function main() {
  let stageProcess: ChildProcessWithoutNullStreams | undefined
  let client: CdpClient | undefined

  try {
    await ensureSmokePrerequisites()
    await mkdir(reportDir, { recursive: true })

    const debugPort = await findAvailablePort()
    stageProcess = startStage(debugPort)
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
        visibilityState: document.visibilityState,
      }
    })()`)

    if (check.readyState !== 'complete')
      throw new Error(`RENDER_CHECK_FAILED: document.readyState=${check.readyState}`)
    if (check.appRootChildCount <= 0)
      throw new Error(`RENDER_CHECK_FAILED: #app root has no children (appRootChildCount=${check.appRootChildCount}). The window likely came up blank.`)
    // The DOM checks above pass even for a hidden window (show: false,
    // ready-to-show never firing): CDP still exposes and can screenshot a
    // renderer that is attached to a native window the user never sees.
    // Chromium reports document.visibilityState='hidden' for such windows,
    // so assert on it. Reading BrowserWindow.isVisible() from the main
    // process is not an option here: Electron's main-process inspector
    // cannot evaluate dynamic import(), and the main bundle is ESM, so
    // there is no require('electron') to reach it with either.
    if (check.visibilityState !== 'visible')
      throw new Error(`RENDER_CHECK_FAILED: document.visibilityState=${check.visibilityState}; the window is not visible`)

    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' })
    const screenshotData = isRecord(screenshot.result) ? screenshot.result.data : undefined
    if (typeof screenshotData !== 'string' || screenshotData.length === 0)
      throw new Error('RENDER_CHECK_FAILED: Page.captureScreenshot returned no image data')
    await writeFile(screenshotPath, Buffer.from(screenshotData, 'base64'))

    console.info(JSON.stringify({
      ok: true,
      reportDir,
      screenshotPath,
      check,
    }, null, 2))
  }
  finally {
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
