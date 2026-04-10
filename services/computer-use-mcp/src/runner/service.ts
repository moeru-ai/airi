import type { Server } from 'node:http'

import type {
  ClickActionInput,
  DisplayInfo,
  DisplaySize,
  ExecutionTarget,
  ForegroundContext,
  PermissionInfo,
  PointerTracePoint,
  PressKeysActionInput,
  ScrollActionInput,
  TypeTextActionInput,
  WaitActionInput,
} from '../types'
import type {
  RunnerActionResult,
  RunnerInitializeParams,
  RunnerInitializeResult,
  RunnerOpenTestTargetResult,
  RunnerScreenshotResult,
} from './protocol'

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { platform } from 'node:process'

import { runProcess, sanitizeFileSegment } from '../utils/process'

const sessionDisplayStart = 90
const sessionDisplayEnd = 110

async function sleep(durationMs: number) {
  await new Promise(resolve => setTimeout(resolve, durationMs))
}

function toExecutionTarget(params: {
  hostName: string
  displayId?: string
  sessionTag?: string
  tainted?: boolean
  note?: string
}): ExecutionTarget {
  return {
    mode: 'remote',
    transport: 'ssh-stdio',
    hostName: params.hostName,
    displayId: params.displayId,
    sessionTag: params.sessionTag,
    isolated: true,
    tainted: params.tainted ?? false,
    note: params.note,
  }
}

function mapButton(button: ClickActionInput['button']) {
  switch (button) {
    case 'right':
      return '3'
    case 'middle':
      return '2'
    default:
      return '1'
  }
}

function normalizeKey(key: string) {
  switch (key.trim().toLowerCase()) {
    case 'cmd':
    case 'command':
      return 'Super_L'
    case 'ctrl':
    case 'control':
      return 'Control_L'
    case 'alt':
    case 'option':
      return 'Alt_L'
    case 'shift':
      return 'Shift_L'
    case 'enter':
      return 'Return'
    case 'esc':
      return 'Escape'
    case 'space':
      return 'space'
    default:
      return key.trim()
  }
}

export class LinuxX11RunnerService {
  private initialized = false
  private displayId?: string
  private observationBaseUrl?: URL
  private observationPublicDir?: string
  private observationServer?: Server
  private observationServePort?: number
  private observationToken?: string
  private xAuthorityPath?: string
  private runtimeDir?: string
  private openboxPid?: number
  private xvfbPid?: number
  private sessionTag?: string
  private displaySize?: DisplaySize
  private target: ExecutionTarget = toExecutionTarget({
    hostName: platform === 'linux' ? 'unknown-linux-runner' : 'unknown-runner',
    tainted: false,
  })

  async initialize(params: RunnerInitializeParams): Promise<RunnerInitializeResult> {
    if (platform !== 'linux') {
      throw new Error(`linux-x11 runner only supports linux hosts, current platform is ${platform}`)
    }

    if (this.initialized) {
      if (params.sessionTag !== this.sessionTag) {
        throw new Error(`runner already initialized for session ${this.sessionTag || 'unknown'}`)
      }

      return {
        executionTarget: this.requireExecutionTarget(),
        displayInfo: await this.getDisplayInfo(),
        permissionInfo: await this.getPermissionInfo(),
      }
    }

    await this.ensureDependencies()

    this.sessionTag = params.sessionTag
    this.displaySize = params.displaySize
    this.runtimeDir = await mkdtemp(join(tmpdir(), `airi-linux-x11-${sanitizeFileSegment(params.sessionTag, 'session')}-`))
    this.observationBaseUrl = params.observationBaseUrl ? new URL(params.observationBaseUrl) : undefined
    this.observationServePort = params.observationServePort
    this.observationToken = params.observationToken?.trim() || randomBytes(12).toString('hex')
    this.observationPublicDir = join(this.runtimeDir, 'published-observations')
    this.xAuthorityPath = join(this.runtimeDir, 'Xauthority')
    this.displayId = await this.allocateDisplayId()

    await this.initializeXAuthority()
    await this.startXvfb()
    await this.waitForDisplay()
    await this.startOpenbox()
    await this.startObservationServer()

    this.target = toExecutionTarget({
      hostName: await this.getHostName(),
      displayId: this.displayId,
      sessionTag: this.sessionTag,
      tainted: false,
    })
    this.initialized = true

    return {
      executionTarget: this.requireExecutionTarget(),
      displayInfo: await this.getDisplayInfo(),
      permissionInfo: await this.getPermissionInfo(),
    }
  }

  async shutdown() {
    await this.stopObservationServer()
    await this.killProcess(this.openboxPid)
    await this.killProcess(this.xvfbPid)
    if (this.runtimeDir) {
      await rm(this.runtimeDir, { recursive: true, force: true })
    }
    this.initialized = false
  }

  async getExecutionTarget() {
    return this.requireExecutionTarget()
  }

  async getDisplayInfo(): Promise<DisplayInfo> {
    await this.ensureReady()
    return {
      available: true,
      platform: 'linux',
      logicalWidth: this.displaySize?.width,
      logicalHeight: this.displaySize?.height,
      pixelWidth: this.displaySize?.width,
      pixelHeight: this.displaySize?.height,
      scaleFactor: 1,
      isRetina: false,
      note: `managed virtual X session ${this.displayId}`,
    }
  }

  async getForegroundContext(): Promise<ForegroundContext> {
    await this.ensureReady()

    try {
      const { stdout } = await runProcess('xprop', ['-root', '_NET_ACTIVE_WINDOW'], {
        timeoutMs: 5_000,
        env: this.getX11Env(),
      })
      const match = stdout.match(/window id # (0x[0-9a-fA-F]+)/)
      if (!match || match[1] === '0x0') {
        return {
          available: false,
          platform: 'linux',
          unavailableReason: 'no active window in managed X session',
        }
      }

      const windowId = match[1]
      const [titleResult, classResult] = await Promise.all([
        runProcess('xprop', ['-id', windowId, '_NET_WM_NAME'], {
          timeoutMs: 5_000,
          env: this.getX11Env(),
        }).catch(() => ({ stdout: '', stderr: '' })),
        runProcess('xprop', ['-id', windowId, 'WM_CLASS'], {
          timeoutMs: 5_000,
          env: this.getX11Env(),
        }).catch(() => ({ stdout: '', stderr: '' })),
      ])

      const title = titleResult.stdout.match(/=\s*"([^"]*)"/)?.[1]
      const classes = classResult.stdout.match(/=\s*"([^"]*)",\s*"([^"]*)"/)

      return {
        available: true,
        appName: classes?.[2] || classes?.[1] || undefined,
        windowTitle: title || undefined,
        platform: 'linux',
      }
    }
    catch (error) {
      return {
        available: false,
        platform: 'linux',
        unavailableReason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async getPermissionInfo(): Promise<PermissionInfo> {
    await this.ensureReady()

    return {
      screenRecording: {
        status: 'granted',
        target: `${this.displayId} via scrot`,
        checkedBy: 'scrot',
      },
      accessibility: {
        status: 'unsupported',
        target: `${this.displayId} linux-x11 session`,
        note: 'linux-x11 runner does not rely on accessibility APIs',
      },
      automationToSystemEvents: {
        status: 'unsupported',
        target: `${this.displayId} linux-x11 session`,
        note: 'linux-x11 runner does not use System Events',
      },
    }
  }

  async takeScreenshot(params: { label?: string }): Promise<RunnerScreenshotResult> {
    await this.ensureReady()

    const fileName = this.observationBaseUrl
      ? `${Date.now()}-${randomBytes(8).toString('hex')}-${sanitizeFileSegment(params.label, 'desktop')}.png`
      : `${Date.now()}-${sanitizeFileSegment(params.label, 'desktop')}.png`
    const outputPath = join(this.observationPublicDir || this.runtimeDir!, fileName)
    await runProcess('scrot', ['-z', '-q', '100', outputPath], {
      timeoutMs: 10_000,
      env: this.getX11Env(),
    })

    const buffer = await readFile(outputPath)
    if (!this.observationBaseUrl) {
      await rm(outputPath, { force: true })
    }

    return {
      dataBase64: buffer.toString('base64'),
      mimeType: 'image/png',
      publicUrl: this.buildObservationPublicUrl(fileName),
      width: this.displaySize?.width,
      height: this.displaySize?.height,
      executionTarget: this.requireExecutionTarget(),
    }
  }

  async click(input: ClickActionInput & { pointerTrace: PointerTracePoint[] }): Promise<RunnerActionResult> {
    await this.ensureReady()

    for (const point of input.pointerTrace) {
      await this.movePointer(point.x, point.y)
      await sleep(point.delayMs)
    }

    await runProcess('xdotool', ['click', '--repeat', String(input.clickCount ?? 1), mapButton(input.button)], {
      timeoutMs: 5_000,
      env: this.getX11Env(),
    })

    return {
      performed: true,
      backend: 'linux-x11',
      notes: [`clicked ${input.x},${input.y} in ${this.displayId}`],
      pointerTrace: input.pointerTrace,
      executionTarget: this.requireExecutionTarget(),
    }
  }

  async typeText(input: TypeTextActionInput): Promise<RunnerActionResult> {
    await this.ensureReady()

    await runProcess('xdotool', ['type', '--delay', '15', '--clearmodifiers', '--', input.text], {
      timeoutMs: 10_000,
      env: this.getX11Env(),
    })
    if (input.pressEnter) {
      await runProcess('xdotool', ['key', '--clearmodifiers', 'Return'], {
        timeoutMs: 5_000,
        env: this.getX11Env(),
      })
    }

    return {
      performed: true,
      backend: 'linux-x11',
      notes: ['typed text in managed X session'],
      executionTarget: this.requireExecutionTarget(),
    }
  }

  async pressKeys(input: PressKeysActionInput): Promise<RunnerActionResult> {
    await this.ensureReady()

    const chord = input.keys.map(normalizeKey).join('+')
    await runProcess('xdotool', ['key', '--clearmodifiers', chord], {
      timeoutMs: 5_000,
      env: this.getX11Env(),
    })

    return {
      performed: true,
      backend: 'linux-x11',
      notes: [`pressed key chord ${chord}`],
      executionTarget: this.requireExecutionTarget(),
    }
  }

  async scroll(input: ScrollActionInput): Promise<RunnerActionResult> {
    await this.ensureReady()

    if (typeof input.x === 'number' && typeof input.y === 'number') {
      await this.movePointer(input.x, input.y)
    }

    const verticalSteps = Math.max(1, Math.ceil(Math.abs(input.deltaY) / 120))
    const verticalButton = input.deltaY < 0 ? '4' : '5'
    for (let index = 0; index < verticalSteps; index += 1) {
      await runProcess('xdotool', ['click', verticalButton], {
        timeoutMs: 5_000,
        env: this.getX11Env(),
      })
    }

    if (input.deltaX) {
      const horizontalSteps = Math.max(1, Math.ceil(Math.abs(input.deltaX) / 120))
      const horizontalButton = input.deltaX < 0 ? '6' : '7'
      for (let index = 0; index < horizontalSteps; index += 1) {
        await runProcess('xdotool', ['click', horizontalButton], {
          timeoutMs: 5_000,
          env: this.getX11Env(),
        })
      }
    }

    return {
      performed: true,
      backend: 'linux-x11',
      notes: ['scrolled in managed X session'],
      executionTarget: this.requireExecutionTarget(),
    }
  }

  async wait(input: WaitActionInput): Promise<RunnerActionResult> {
    await this.ensureReady()
    await sleep(Math.max(input.durationMs, 0))

    return {
      performed: true,
      backend: 'linux-x11',
      notes: ['waited in managed X session'],
      executionTarget: this.requireExecutionTarget(),
    }
  }

  async openTestTarget(): Promise<RunnerOpenTestTargetResult> {
    await this.ensureReady()

    const child = spawn('mousepad', ['--disable-server'], {
      env: this.getX11Env(),
      stdio: 'ignore',
      detached: false,
    })

    const windowId = await this.waitForWindow(child.pid)
    await runProcess('wmctrl', ['-i', '-r', windowId, '-e', '0,80,40,1000,620'], {
      timeoutMs: 5_000,
      env: this.getX11Env(),
    }).catch(() => {})
    await runProcess('wmctrl', ['-i', '-a', windowId], {
      timeoutMs: 5_000,
      env: this.getX11Env(),
    }).catch(() => {})
    // NOTICE: xdotool --sync can hang under Xvfb/openbox when the target window
    // is already focused or a pointer move is effectively a no-op. Keep activation
    // best-effort and rely on a short settle delay instead of sync waits.
    await runProcess('xdotool', ['windowactivate', windowId], {
      timeoutMs: 5_000,
      env: this.getX11Env(),
    }).catch(() => {})
    await sleep(100)

    return {
      launched: true,
      appName: 'mousepad',
      windowTitle: 'Mousepad',
      recommendedClickPoint: {
        x: 180,
        y: 150,
      },
      executionTarget: this.requireExecutionTarget(),
    }
  }

  private async ensureDependencies() {
    for (const binary of ['Xvfb', 'xauth', 'xdotool', 'wmctrl', 'scrot', 'openbox', 'xdpyinfo', 'xprop']) {
      await runProcess('which', [binary], {
        timeoutMs: 5_000,
      }).catch(() => {
        throw new Error(`missing required linux-x11 runner dependency: ${binary}`)
      })
    }
  }

  private async allocateDisplayId() {
    for (let displayNumber = sessionDisplayStart; displayNumber <= sessionDisplayEnd; displayNumber += 1) {
      const displayId = `:${displayNumber}`
      const available = await runProcess('xdpyinfo', ['-display', displayId], {
        timeoutMs: 1_500,
        env: this.getX11Env(displayId),
      }).then(() => false).catch(() => true)

      if (available)
        return displayId
    }

    throw new Error(`unable to allocate a free X display between :${sessionDisplayStart} and :${sessionDisplayEnd}`)
  }

  private async initializeXAuthority() {
    const cookie = randomBytes(16).toString('hex')
    await runProcess('xauth', ['-f', this.xAuthorityPath!, 'add', this.displayId!, '.', cookie], {
      timeoutMs: 5_000,
    })
  }

  private async startXvfb() {
    const child = spawn('Xvfb', [
      this.displayId!,
      '-screen',
      '0',
      `${this.displaySize!.width}x${this.displaySize!.height}x24`,
      '-nolisten',
      'tcp',
      '-auth',
      this.xAuthorityPath!,
    ], {
      env: this.getX11Env(),
      stdio: 'ignore',
    })

    this.xvfbPid = child.pid
  }

  private async startOpenbox() {
    const child = spawn('openbox', [], {
      env: this.getX11Env(),
      stdio: 'ignore',
    })

    this.openboxPid = child.pid
  }

  private async waitForDisplay() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const ready = await runProcess('xdpyinfo', ['-display', this.displayId!], {
        timeoutMs: 1_500,
        env: this.getX11Env(),
      }).then(() => true).catch(() => false)

      if (ready)
        return

      await sleep(200)
    }

    throw new Error(`timed out waiting for virtual display ${this.displayId}`)
  }

  private async waitForWindow(pid?: number) {
    if (!pid) {
      throw new Error('test target did not provide a process id')
    }

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const { stdout } = await runProcess('wmctrl', ['-lp'], {
        timeoutMs: 5_000,
        env: this.getX11Env(),
      }).catch(() => ({ stdout: '', stderr: '' }))

      const match = stdout.split(/\r?\n/).find((line) => {
        return line.trim().split(/\s+/)[2] === String(pid)
      })

      if (match) {
        return match.trim().split(/\s+/)[0]
      }

      await sleep(250)
    }

    throw new Error('timed out waiting for the mousepad window')
  }

  private async killProcess(pid?: number) {
    if (!pid)
      return

    await runProcess('kill', ['-TERM', String(pid)], {
      timeoutMs: 5_000,
    }).catch(() => {})
  }

  private async getHostName() {
    const { stdout } = await runProcess('hostname', [], {
      timeoutMs: 5_000,
    })
    return stdout.trim() || homedir()
  }

  private requireExecutionTarget() {
    if (!this.initialized || !this.displayId || !this.displaySize) {
      throw new Error('linux-x11 runner is not initialized')
    }

    return {
      ...this.target,
      hostName: this.target.hostName,
      displayId: this.displayId,
      sessionTag: this.sessionTag,
    }
  }

  private async ensureReady() {
    if (!this.initialized) {
      throw new Error('linux-x11 runner is not initialized')
    }
  }

  private async startObservationServer() {
    if (!this.observationBaseUrl || !this.observationServePort || !this.observationPublicDir) {
      return
    }

    await mkdir(this.observationPublicDir, { recursive: true })

    const basePath = this.getObservationBasePath()
    const routePrefix = `${basePath}/${this.observationToken}`.replace(/\/{2,}/g, '/')

    this.observationServer = createServer(async (request, response) => {
      const pathname = (request.url || '/').split('?')[0] || '/'
      if (!pathname.startsWith(`${routePrefix}/`)) {
        response.writeHead(404)
        response.end('not found')
        return
      }

      const requestedName = basename(pathname.slice(routePrefix.length + 1))
      if (!requestedName.endsWith('.png')) {
        response.writeHead(404)
        response.end('not found')
        return
      }

      const filePath = join(this.observationPublicDir!, requestedName)
      try {
        await access(filePath)
      }
      catch {
        response.writeHead(404)
        response.end('not found')
        return
      }

      const stream = createReadStream(filePath)
      stream.on('error', () => {
        if (!response.headersSent) {
          response.writeHead(404)
          response.end('not found')
          return
        }

        response.destroy()
      })

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'image/png',
      })
      stream.pipe(response)
    })

    await new Promise<void>((resolve, reject) => {
      this.observationServer!.once('error', reject)
      this.observationServer!.listen(this.observationServePort, '0.0.0.0', () => {
        this.observationServer?.off('error', reject)
        resolve()
      })
    })
  }

  private async stopObservationServer() {
    if (!this.observationServer) {
      return
    }

    const server = this.observationServer
    this.observationServer = undefined
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }

  private getObservationBasePath() {
    if (!this.observationBaseUrl) {
      return ''
    }

    return this.observationBaseUrl.pathname.replace(/\/$/, '')
  }

  private buildObservationPublicUrl(fileName: string) {
    if (!this.observationBaseUrl || !this.observationToken) {
      return undefined
    }

    const basePath = this.getObservationBasePath()
    const pathName = `${basePath}/${this.observationToken}/${fileName}`.replace(/\/{2,}/g, '/')
    return new URL(pathName, this.observationBaseUrl).toString()
  }

  private getX11Env(displayOverride?: string) {
    return {
      ...process.env,
      DISPLAY: displayOverride || this.displayId,
      XAUTHORITY: this.xAuthorityPath,
    }
  }

  private async movePointer(x: number, y: number) {
    // NOTICE: repeated clicks at the same coordinate are a normal computer-use flow.
    // `xdotool mousemove --sync` waits for an actual pointer movement and can block
    // forever when the pointer is already at the requested position under Xvfb/openbox.
    await runProcess('xdotool', ['mousemove', String(x), String(y)], {
      timeoutMs: 5_000,
      env: this.getX11Env(),
    })
  }
}
