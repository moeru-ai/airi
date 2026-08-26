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

import process, { platform } from 'node:process'

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { errorMessageFromValue } from '../utils/error-message'
import { runProcess, sanitizeFileSegment } from '../utils/process'

const sessionDisplayStart = 90
const sessionDisplayEnd = 110
const ACTIVE_WINDOW_ID_RE = /window id # (0x[0-9a-fA-F]+)/
const XPROP_TITLE_RE = /=\s*"([^"]*)"/
const XPROP_CLASS_RE = /=\s*"([^"]*)",\s*"([^"]*)"/
const CRLF_SPLIT_RE = /\r?\n/
const WHITESPACE_SPLIT_RE = /\s+/
const TRAILING_SLASH_RE = /\/$/
const DUPLICATE_SLASH_RE = /\/{2,}/g

export class LinuxX11RunnerService {
  private displayId?: string
  private displaySize?: DisplaySize
  private initialized = false
  private observationBaseUrl?: URL
  private observationPublicDir?: string
  private observationServePort?: number
  private observationServer?: Server
  private observationToken?: string
  private openboxPid?: number
  private runtimeDir?: string
  private sessionTag?: string
  private target: ExecutionTarget = toExecutionTarget({
    hostName: platform === 'linux' ? 'unknown-linux-runner' : 'unknown-runner',
    tainted: false,
  })

  private xAuthorityPath?: string
  private xvfbPid?: number

  async click(input: ClickActionInput & { pointerTrace: PointerTracePoint[] }): Promise<RunnerActionResult> {
    await this.ensureReady()

    for (const point of input.pointerTrace) {
      await this.movePointer(point.x, point.y)
      await sleep(point.delayMs)
    }

    await runProcess('xdotool', ['click', '--repeat', String(input.clickCount ?? 1), mapButton(input.button)], {
      env: this.getX11Env(),
      timeoutMs: 5_000,
    })

    return {
      backend: 'linux-x11',
      executionTarget: this.requireExecutionTarget(),
      notes: [`clicked ${input.x},${input.y} in ${this.displayId}`],
      performed: true,
      pointerTrace: input.pointerTrace,
    }
  }

  async getDisplayInfo(): Promise<DisplayInfo> {
    await this.ensureReady()
    return {
      available: true,
      isRetina: false,
      logicalHeight: this.displaySize?.height,
      logicalWidth: this.displaySize?.width,
      note: `managed virtual X session ${this.displayId}`,
      pixelHeight: this.displaySize?.height,
      pixelWidth: this.displaySize?.width,
      platform: 'linux',
      scaleFactor: 1,
    }
  }

  async getExecutionTarget() {
    return this.requireExecutionTarget()
  }

  async getForegroundContext(): Promise<ForegroundContext> {
    await this.ensureReady()

    try {
      const { stdout } = await runProcess('xprop', ['-root', '_NET_ACTIVE_WINDOW'], {
        env: this.getX11Env(),
        timeoutMs: 5_000,
      })
      const match = stdout.match(ACTIVE_WINDOW_ID_RE)
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
          env: this.getX11Env(),
          timeoutMs: 5_000,
        }).catch(() => ({ stderr: '', stdout: '' })),
        runProcess('xprop', ['-id', windowId, 'WM_CLASS'], {
          env: this.getX11Env(),
          timeoutMs: 5_000,
        }).catch(() => ({ stderr: '', stdout: '' })),
      ])

      const title = titleResult.stdout.match(XPROP_TITLE_RE)?.[1]
      const classes = classResult.stdout.match(XPROP_CLASS_RE)

      return {
        appName: classes?.[2] || classes?.[1] || undefined,
        available: true,
        platform: 'linux',
        windowTitle: title || undefined,
      }
    }
    catch (error) {
      return {
        available: false,
        platform: 'linux',
        unavailableReason: errorMessageFromValue(error),
      }
    }
  }

  async getPermissionInfo(): Promise<PermissionInfo> {
    await this.ensureReady()

    return {
      accessibility: {
        note: 'linux-x11 runner does not rely on accessibility APIs',
        status: 'unsupported',
        target: `${this.displayId} linux-x11 session`,
      },
      automationToSystemEvents: {
        note: 'linux-x11 runner does not use System Events',
        status: 'unsupported',
        target: `${this.displayId} linux-x11 session`,
      },
      screenRecording: {
        checkedBy: 'scrot',
        status: 'granted',
        target: `${this.displayId} via scrot`,
      },
    }
  }

  async initialize(params: RunnerInitializeParams): Promise<RunnerInitializeResult> {
    if (platform !== 'linux') {
      throw new Error(`linux-x11 runner only supports linux hosts, current platform is ${platform}`)
    }

    if (this.initialized) {
      if (params.sessionTag !== this.sessionTag) {
        throw new Error(`runner already initialized for session ${this.sessionTag || 'unknown'}`)
      }

      return {
        displayInfo: await this.getDisplayInfo(),
        executionTarget: this.requireExecutionTarget(),
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
      displayId: this.displayId,
      hostName: await this.getHostName(),
      sessionTag: this.sessionTag,
      tainted: false,
    })
    this.initialized = true

    return {
      displayInfo: await this.getDisplayInfo(),
      executionTarget: this.requireExecutionTarget(),
      permissionInfo: await this.getPermissionInfo(),
    }
  }

  async openTestTarget(): Promise<RunnerOpenTestTargetResult> {
    await this.ensureReady()

    const child = spawn('mousepad', ['--disable-server'], {
      detached: false,
      env: this.getX11Env(),
      stdio: 'ignore',
    })

    const windowId = await this.waitForWindow(child.pid)
    await runProcess('wmctrl', ['-i', '-r', windowId, '-e', '0,80,40,1000,620'], {
      env: this.getX11Env(),
      timeoutMs: 5_000,
    }).catch(() => {})
    await runProcess('wmctrl', ['-i', '-a', windowId], {
      env: this.getX11Env(),
      timeoutMs: 5_000,
    }).catch(() => {})
    // NOTICE: xdotool --sync can hang under Xvfb/openbox when the target window
    // is already focused or a pointer move is effectively a no-op. Keep activation
    // best-effort and rely on a short settle delay instead of sync waits.
    await runProcess('xdotool', ['windowactivate', windowId], {
      env: this.getX11Env(),
      timeoutMs: 5_000,
    }).catch(() => {})
    await sleep(100)

    return {
      appName: 'mousepad',
      executionTarget: this.requireExecutionTarget(),
      launched: true,
      recommendedClickPoint: {
        x: 180,
        y: 150,
      },
      windowTitle: 'Mousepad',
    }
  }

  async pressKeys(input: PressKeysActionInput): Promise<RunnerActionResult> {
    await this.ensureReady()

    const chord = input.keys.map(normalizeKey).join('+')
    await runProcess('xdotool', ['key', '--clearmodifiers', chord], {
      env: this.getX11Env(),
      timeoutMs: 5_000,
    })

    return {
      backend: 'linux-x11',
      executionTarget: this.requireExecutionTarget(),
      notes: [`pressed key chord ${chord}`],
      performed: true,
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
        env: this.getX11Env(),
        timeoutMs: 5_000,
      })
    }

    if (input.deltaX) {
      const horizontalSteps = Math.max(1, Math.ceil(Math.abs(input.deltaX) / 120))
      const horizontalButton = input.deltaX < 0 ? '6' : '7'
      for (let index = 0; index < horizontalSteps; index += 1) {
        await runProcess('xdotool', ['click', horizontalButton], {
          env: this.getX11Env(),
          timeoutMs: 5_000,
        })
      }
    }

    return {
      backend: 'linux-x11',
      executionTarget: this.requireExecutionTarget(),
      notes: ['scrolled in managed X session'],
      performed: true,
    }
  }

  async shutdown() {
    await this.stopObservationServer()
    await this.killProcess(this.openboxPid)
    await this.killProcess(this.xvfbPid)
    if (this.runtimeDir) {
      await rm(this.runtimeDir, { force: true, recursive: true })
    }
    this.initialized = false
  }

  async takeScreenshot(params: { label?: string }): Promise<RunnerScreenshotResult> {
    await this.ensureReady()

    const fileName = this.observationBaseUrl
      ? `${Date.now()}-${randomBytes(8).toString('hex')}-${sanitizeFileSegment(params.label, 'desktop')}.png`
      : `${Date.now()}-${sanitizeFileSegment(params.label, 'desktop')}.png`
    const outputPath = join(this.observationPublicDir || this.runtimeDir!, fileName)
    await runProcess('scrot', ['-z', '-q', '100', outputPath], {
      env: this.getX11Env(),
      timeoutMs: 10_000,
    })

    const buffer = await readFile(outputPath)
    if (!this.observationBaseUrl) {
      await rm(outputPath, { force: true })
    }

    return {
      dataBase64: buffer.toString('base64'),
      executionTarget: this.requireExecutionTarget(),
      height: this.displaySize?.height,
      mimeType: 'image/png',
      publicUrl: this.buildObservationPublicUrl(fileName),
      width: this.displaySize?.width,
    }
  }

  async typeText(input: TypeTextActionInput): Promise<RunnerActionResult> {
    await this.ensureReady()

    await runProcess('xdotool', ['type', '--delay', '15', '--clearmodifiers', '--', input.text], {
      env: this.getX11Env(),
      timeoutMs: 10_000,
    })
    if (input.pressEnter) {
      await runProcess('xdotool', ['key', '--clearmodifiers', 'Return'], {
        env: this.getX11Env(),
        timeoutMs: 5_000,
      })
    }

    return {
      backend: 'linux-x11',
      executionTarget: this.requireExecutionTarget(),
      notes: ['typed text in managed X session'],
      performed: true,
    }
  }

  async wait(input: WaitActionInput): Promise<RunnerActionResult> {
    await this.ensureReady()
    await sleep(Math.max(input.durationMs, 0))

    return {
      backend: 'linux-x11',
      executionTarget: this.requireExecutionTarget(),
      notes: ['waited in managed X session'],
      performed: true,
    }
  }

  private async allocateDisplayId() {
    for (let displayNumber = sessionDisplayStart; displayNumber <= sessionDisplayEnd; displayNumber += 1) {
      const displayId = `:${displayNumber}`
      const available = await runProcess('xdpyinfo', ['-display', displayId], {
        env: this.getX11Env(displayId),
        timeoutMs: 1_500,
      }).then(() => false).catch(() => true)

      if (available)
        return displayId
    }

    throw new Error(`unable to allocate a free X display between :${sessionDisplayStart} and :${sessionDisplayEnd}`)
  }

  private buildObservationPublicUrl(fileName: string) {
    if (!this.observationBaseUrl || !this.observationToken) {
      return undefined
    }

    const basePath = this.getObservationBasePath()
    const pathName = `${basePath}/${this.observationToken}/${fileName}`.replace(DUPLICATE_SLASH_RE, '/')
    return new URL(pathName, this.observationBaseUrl).toString()
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

  private async ensureReady() {
    if (!this.initialized) {
      throw new Error('linux-x11 runner is not initialized')
    }
  }

  private async getHostName() {
    const { stdout } = await runProcess('hostname', [], {
      timeoutMs: 5_000,
    })
    return stdout.trim() || homedir()
  }

  private getObservationBasePath() {
    if (!this.observationBaseUrl) {
      return ''
    }

    return this.observationBaseUrl.pathname.replace(TRAILING_SLASH_RE, '')
  }

  private getX11Env(displayOverride?: string) {
    return {
      ...process.env,
      DISPLAY: displayOverride || this.displayId,
      XAUTHORITY: this.xAuthorityPath,
    }
  }

  private async initializeXAuthority() {
    const cookie = randomBytes(16).toString('hex')
    await runProcess('xauth', ['-f', this.xAuthorityPath!, 'add', this.displayId!, '.', cookie], {
      timeoutMs: 5_000,
    })
  }

  private async killProcess(pid?: number) {
    if (!pid)
      return

    await runProcess('kill', ['-TERM', String(pid)], {
      timeoutMs: 5_000,
    }).catch(() => {})
  }

  private async movePointer(x: number, y: number) {
    // NOTICE: repeated clicks at the same coordinate are a normal computer-use flow.
    // `xdotool mousemove --sync` waits for an actual pointer movement and can block
    // forever when the pointer is already at the requested position under Xvfb/openbox.
    await runProcess('xdotool', ['mousemove', String(x), String(y)], {
      env: this.getX11Env(),
      timeoutMs: 5_000,
    })
  }

  private requireExecutionTarget() {
    if (!this.initialized || !this.displayId || !this.displaySize) {
      throw new Error('linux-x11 runner is not initialized')
    }

    return {
      ...this.target,
      displayId: this.displayId,
      hostName: this.target.hostName,
      sessionTag: this.sessionTag,
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

  private async startOpenbox() {
    const child = spawn('openbox', [], {
      env: this.getX11Env(),
      stdio: 'ignore',
    })

    this.openboxPid = child.pid
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

  private async waitForDisplay() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const ready = await runProcess('xdpyinfo', ['-display', this.displayId!], {
        env: this.getX11Env(),
        timeoutMs: 1_500,
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
        env: this.getX11Env(),
        timeoutMs: 5_000,
      }).catch(() => ({ stderr: '', stdout: '' }))

      const match = stdout.split(CRLF_SPLIT_RE).find((line) => {
        return line.trim().split(WHITESPACE_SPLIT_RE)[2] === String(pid)
      })

      if (match) {
        return match.trim().split(WHITESPACE_SPLIT_RE)[0]
      }

      await sleep(250)
    }

    throw new Error('timed out waiting for the mousepad window')
  }
}

function mapButton(button: ClickActionInput['button']) {
  switch (button) {
    case 'middle':
      return '2'
    case 'right':
      return '3'
    default:
      return '1'
  }
}

function normalizeKey(key: string) {
  switch (key.trim().toLowerCase()) {
    case 'alt':
    case 'option':
      return 'Alt_L'
    case 'cmd':
    case 'command':
      return 'Super_L'
    case 'control':
    case 'ctrl':
      return 'Control_L'
    case 'enter':
      return 'Return'
    case 'esc':
      return 'Escape'
    case 'shift':
      return 'Shift_L'
    case 'space':
      return 'space'
    default:
      return key.trim()
  }
}

async function sleep(durationMs: number) {
  await new Promise(resolve => setTimeout(resolve, durationMs))
}

function toExecutionTarget(params: {
  displayId?: string
  hostName: string
  note?: string
  sessionTag?: string
  tainted?: boolean
}): ExecutionTarget {
  return {
    displayId: params.displayId,
    hostName: params.hostName,
    isolated: true,
    mode: 'remote',
    note: params.note,
    sessionTag: params.sessionTag,
    tainted: params.tainted ?? false,
    transport: 'ssh-stdio',
  }
}
