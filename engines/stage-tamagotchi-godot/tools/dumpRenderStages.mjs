import process from 'node:process'

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const repositoryRoot = resolve(projectDirectory, '..', '..')
const defaultModelPath = join(
  repositoryRoot,
  'packages',
  'stage-ui',
  'src',
  'assets',
  'vrm',
  'models',
  'AvatarSample-A',
  'AvatarSample_A.vrm',
)
const artifactDirectory = join(projectDirectory, 'artifacts', 'render-stages')
const defaultLogPath = join(artifactDirectory, 'godot-stage.log')
const defaultRenderStageViews = [
  'scene-copy',
  'avatar-mask',
  'avatar-edge-mask',
  'after-avatar-edge-light',
  'after-avatar-glow',
  'final',
  'final-edge-off',
]
const windowCaptureScriptPath = join(scriptDirectory, 'captureWindowClientPng.ps1')
const webSocketGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function parseArgs(argv) {
  const options = {
    avatarEdgeLight: true,
    godotPath: process.env.GODOT4,
    headless: false,
    height: 720,
    logPath: defaultLogPath,
    modelPath: defaultModelPath,
    renderStageViews: null,
    settleMs: 1000,
    stageDumpDirectory: null,
    viewPreset: 'default',
    width: 1280,
  }

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    switch (argument) {
      case '--avatar-edge-light':
        options.avatarEdgeLight = parseAvatarEdgeLight(
          resolveRequiredValue(argv, ++index, argument),
          argument,
        )
        break
      case '--godot':
        options.godotPath = resolveRequiredValue(argv, ++index, argument)
        break
      case '--dump-render-stages':
        options.stageDumpDirectory = resolveRequiredValue(argv, ++index, argument)
        break
      case '--headless':
        options.headless = true
        break
      case '--height':
        options.height = parsePositiveInteger(resolveRequiredValue(argv, ++index, argument), argument)
        break
      case '--log-file':
        options.logPath = resolveRequiredValue(argv, ++index, argument)
        break
      case '--model':
        options.modelPath = resolveRequiredValue(argv, ++index, argument)
        break
      case '--render-stages':
        options.renderStageViews = parseRenderStageViews(
          resolveRequiredValue(argv, ++index, argument),
          argument,
        )
        break
      case '--settle-ms':
        options.settleMs = parseNonNegativeInteger(
          resolveRequiredValue(argv, ++index, argument),
          argument,
        )
        break
      case '--view-preset':
        options.viewPreset = parseViewPreset(resolveRequiredValue(argv, ++index, argument), argument)
        break
      case '--width':
        options.width = parsePositiveInteger(resolveRequiredValue(argv, ++index, argument), argument)
        break
      default:
        throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (!options.godotPath) {
    throw new Error('GODOT4 is not set. Pass --godot or set GODOT4 to the Godot .NET executable.')
  }

  if (options.headless) {
    throw new Error('Render-stage window capture requires a visible Godot window. Remove --headless.')
  }

  if (!options.stageDumpDirectory) {
    throw new Error('Pass --dump-render-stages <directory>. Baseline comparison is not supported.')
  }

  options.godotPath = resolve(options.godotPath)
  options.logPath = resolve(options.logPath)
  options.modelPath = resolve(options.modelPath)
  options.stageDumpDirectory = resolve(options.stageDumpDirectory)
  options.renderStageViews ??= defaultRenderStageViews
  return options
}

function resolveRequiredValue(argv, index, label) {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`${label} requires a value.`)
  }

  return value
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }

  return parsed
}

function parseNonNegativeInteger(value, label) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }

  return parsed
}

function parseRenderStageViews(value, label) {
  const views = value.split(',').map(item => item.trim()).filter(Boolean)
  if (views.length === 0) {
    throw new Error(`${label} must include at least one render stage.`)
  }

  return views
}

function parseViewPreset(value, label) {
  if (value === 'default' || value === 'upper-body') {
    return value
  }

  throw new Error(`${label} must be "default" or "upper-body".`)
}

function parseAvatarEdgeLight(value, label) {
  switch (value) {
    case 'on':
    case 'enabled':
    case 'true':
      return true
    case 'off':
    case 'disabled':
    case 'false':
      return false
    default:
      throw new Error(`${label} must be "on" or "off".`)
  }
}

async function createStageHost() {
  let peerSocket
  let peerBuffer = Buffer.alloc(0)
  const messages = []
  const waiters = []
  const token = randomUUID()
  const server = createServer()

  server.on('upgrade', (request, socket) => {
    const requestUrl = new URL(request.url ?? '/', 'ws://127.0.0.1')
    if (requestUrl.pathname !== '/ws' || requestUrl.searchParams.get('token') !== token) {
      socket.destroy()
      return
    }

    const key = request.headers['sec-websocket-key']
    if (typeof key !== 'string') {
      socket.destroy()
      return
    }

    const accept = createHash('sha1').update(`${key}${webSocketGuid}`).digest('base64')
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n',
    ].join('\r\n'))

    peerSocket = socket
    socket.on('data', (chunk) => {
      peerBuffer = Buffer.concat([peerBuffer, chunk])
      const result = readFrames(peerBuffer)
      peerBuffer = result.remaining
      for (const frame of result.frames) {
        if (frame.opcode === 0x1) {
          pushMessage(JSON.parse(frame.payload.toString('utf8')))
        }
        else if (frame.opcode === 0x8) {
          socket.end()
        }
        else if (frame.opcode === 0x9) {
          writeFrame(socket, 0xA, frame.payload)
        }
      }
    })
    socket.on('close', () => {
      if (peerSocket === socket) {
        peerSocket = undefined
      }
    })
  })

  function pushMessage(message) {
    messages.push(message)
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index]
      if (waiter.predicate(message)) {
        waiters.splice(index, 1)
        clearTimeout(waiter.timeout)
        waiter.resolve(message)
      }
    }
  }

  function waitFor(predicate, timeoutMs, label) {
    const existingIndex = messages.findIndex(predicate)
    if (existingIndex >= 0) {
      const [message] = messages.splice(existingIndex, 1)
      return Promise.resolve(message)
    }

    return new Promise((resolvePromise, rejectPromise) => {
      const waiter = {
        predicate,
        resolve: resolvePromise,
        timeout: setTimeout(() => {
          const waiterIndex = waiters.indexOf(waiter)
          if (waiterIndex >= 0) {
            waiters.splice(waiterIndex, 1)
          }

          rejectPromise(new Error(`Timed out waiting for ${label}.`))
        }, timeoutMs),
      }
      waiters.push(waiter)
    })
  }

  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectPromise)
      resolvePromise()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind local WebSocket host.')
  }

  return {
    close: () => new Promise((resolvePromise) => {
      let resolved = false
      let timeout
      const resolveOnce = () => {
        if (resolved) {
          return
        }

        resolved = true
        clearTimeout(timeout)
        resolvePromise()
      }
      timeout = setTimeout(resolveOnce, 1000)
      peerSocket?.destroy()
      server.close(resolveOnce)
    }),
    send(type, payload) {
      if (!peerSocket) {
        throw new Error(`Cannot send ${type}; Godot WebSocket is not connected.`)
      }

      writeFrame(peerSocket, 0x1, Buffer.from(JSON.stringify({ type, payload }), 'utf8'))
    },
    url: `ws://127.0.0.1:${address.port}/ws?token=${token}`,
    waitForType(type, timeoutMs) {
      return waitFor(message => message?.type === type, timeoutMs, type)
    },
    waitForRequest(type, requestId, timeoutMs) {
      return waitFor(
        message => message?.type === type && message?.payload?.requestId === requestId,
        timeoutMs,
        `${type} ${requestId}`,
      )
    },
  }
}

function readFrames(buffer) {
  const frames = []
  let offset = 0

  while (buffer.length - offset >= 2) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    const opcode = first & 0x0F
    const masked = (second & 0x80) !== 0
    let length = second & 0x7F
    let headerLength = 2

    if (length === 126) {
      if (buffer.length - offset < 4) {
        break
      }

      length = buffer.readUInt16BE(offset + 2)
      headerLength = 4
    }
    else if (length === 127) {
      if (buffer.length - offset < 10) {
        break
      }

      const bigLength = buffer.readBigUInt64BE(offset + 2)
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('WebSocket frame was too large.')
      }

      length = Number(bigLength)
      headerLength = 10
    }

    const maskLength = masked ? 4 : 0
    const totalLength = headerLength + maskLength + length
    if (buffer.length - offset < totalLength) {
      break
    }

    const payloadStart = offset + headerLength + maskLength
    const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + length))
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4)
      for (let index = 0; index < payload.length; index++) {
        payload[index] ^= mask[index % 4]
      }
    }

    frames.push({ opcode, payload })
    offset += totalLength
  }

  return {
    frames,
    remaining: buffer.subarray(offset),
  }
}

function writeFrame(socket, opcode, payload) {
  const length = payload.length
  let header
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length])
  }
  else if (length <= 0xFFFF) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(length, 2)
  }
  else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }

  socket.write(Buffer.concat([header, payload]))
}

function launchGodot(options, webSocketUrl) {
  const args = [
    '--path',
    projectDirectory,
    '--resolution',
    `${options.width}x${options.height}`,
    '--log-file',
    options.logPath,
  ]

  if (options.headless) {
    args.push('--headless')
  }

  args.push('--', `--airi-ws-url=${webSocketUrl}`)

  return spawn(options.godotPath, args, {
    cwd: projectDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  })
}

function waitForProcessExit(processHandle, timeoutMs) {
  return new Promise((resolvePromise) => {
    const timeout = setTimeout(resolvePromise, timeoutMs, false)
    processHandle.once('close', () => {
      clearTimeout(timeout)
      resolvePromise(true)
    })
  })
}

async function stopGodot(host, processHandle) {
  try {
    host.send('host.shutdown')
  }
  catch {}

  const exited = await waitForProcessExit(processHandle, 3000)
  if (!exited) {
    processHandle.kill()
    await waitForProcessExit(processHandle, 3000)
  }
}

async function captureGodotWindowPng(processHandle, options) {
  if (process.platform !== 'win32') {
    throw new Error('Render-stage window capture currently requires Windows.')
  }

  if (!processHandle.pid) {
    throw new Error('Godot process id was not available for window capture.')
  }

  const result = await runProcess(
    process.env.PWSH ?? 'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      windowCaptureScriptPath,
      '-TargetProcessId',
      String(processHandle.pid),
      '-OutputPath',
      options.currentPath,
      '-SettleMs',
      String(options.settleMs),
    ],
  )

  const stdout = result.stdout.trim()
  const lines = stdout.split(/\r?\n/).filter(Boolean)
  const lastLine = lines[lines.length - 1]
  if (!lastLine) {
    throw new Error('Window capture did not return JSON metadata.')
  }

  try {
    return JSON.parse(lastLine)
  }
  catch (error) {
    throw new Error(`Failed to parse window capture metadata: ${error.message}\n${stdout}`)
  }
}

async function setRenderDebugView(host, view) {
  const requestId = randomUUID()
  host.send('host.render.set_debug_view', {
    requestId,
    view,
  })
  const response = await host.waitForRequest('stage.render.debug_view', requestId, 10000)
  if (response?.payload?.view !== view) {
    throw new Error(`Godot applied unexpected render debug view: ${response?.payload?.view}`)
  }
}

async function setAvatarEdgeLight(host, enabled) {
  const requestId = randomUUID()
  host.send('host.render.set_avatar_edge_light', {
    requestId,
    enabled,
  })
  const response = await host.waitForRequest('stage.render.avatar_edge_light', requestId, 10000)
  if (response?.payload?.enabled !== enabled) {
    throw new Error(`Godot applied unexpected avatar edge-light state: ${response?.payload?.enabled}`)
  }
}

async function applyViewPreset(host, preset) {
  if (preset === 'default') {
    return
  }

  const snapshot = await requestViewSnapshot(host)
  const patch = createViewPresetPatch(preset, snapshot)
  const requestId = randomUUID()
  host.send('host.view.patch', {
    requestId,
    patch,
  })
  await host.waitForRequest('stage.view.snapshot', requestId, 10000)
}

async function requestViewSnapshot(host) {
  const requestId = randomUUID()
  host.send('host.view.request_snapshot', {
    requestId,
  })
  const response = await host.waitForRequest('stage.view.snapshot', requestId, 10000)
  return response.payload
}

function createViewPresetPatch(preset, snapshot) {
  if (preset !== 'upper-body') {
    throw new Error(`Unknown view preset: ${preset}`)
  }

  const bounds = snapshot?.avatarBounds
  if (!bounds) {
    throw new Error('Upper-body view preset requires avatar bounds from Godot.')
  }

  const center = bounds.center
  const size = bounds.size
  const fovDeg = 35
  const targetY = center.y + size.y * 0.22
  const distance = Math.max(size.y * 0.95, 1.2)
  const positionY = targetY + size.y * 0.02
  const pitchDeg = Math.atan2(targetY - positionY, distance) * 180 / Math.PI

  return {
    camera: {
      position: {
        x: center.x,
        y: positionY,
        z: center.z + distance,
      },
      yawDeg: 0,
      pitchDeg,
      fovDeg,
    },
  }
}

async function captureRenderStageViews(host, processHandle, options) {
  await mkdir(options.stageDumpDirectory, { recursive: true })

  for (const view of options.renderStageViews) {
    const isEdgeOffView = view === 'final-edge-off'
    const edgeLightEnabled = isEdgeOffView ? false : options.avatarEdgeLight
    await setAvatarEdgeLight(host, edgeLightEnabled)
    await setRenderDebugView(host, isEdgeOffView ? 'final' : view)
    const stageCapturePath = join(options.stageDumpDirectory, `${view}.png`)
    const capture = await captureGodotWindowPng(processHandle, {
      ...options,
      currentPath: stageCapturePath,
    })
    console.info(
      `Captured render stage ${view}: ${capture.path} (${capture.width}x${capture.height})`,
    )
  }

  await setAvatarEdgeLight(host, options.avatarEdgeLight)
  await setRenderDebugView(host, 'final')
}

function runProcess(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: projectDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdout = []
    const stderr = []

    child.stdout.on('data', chunk => stdout.push(chunk))
    child.stderr.on('data', chunk => stderr.push(chunk))
    child.once('error', rejectPromise)
    child.once('close', (code) => {
      const result = {
        code,
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdout: Buffer.concat(stdout).toString('utf8'),
      }
      if (code !== 0) {
        rejectPromise(new Error(result.stderr.trim() || `${command} exited with code ${code}.`))
        return
      }

      resolvePromise(result)
    })
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!existsSync(options.godotPath)) {
    throw new Error(`Godot executable does not exist: ${options.godotPath}`)
  }

  if (!existsSync(options.modelPath)) {
    throw new Error(`VRM model does not exist: ${options.modelPath}`)
  }

  await mkdir(dirname(options.logPath), { recursive: true })
  await mkdir(options.stageDumpDirectory, { recursive: true })

  const host = await createStageHost()
  const godot = launchGodot(options, host.url)
  godot.stdout.on('data', chunk => process.stdout.write(chunk))
  godot.stderr.on('data', chunk => process.stderr.write(chunk))

  try {
    await host.waitForType('stage.ready', 20000)
    host.send('host.scene.apply', {
      format: 'vrm',
      modelId: 'render-stage-observation-avatar-sample-a',
      name: 'AvatarSample_A',
      path: options.modelPath,
    })
    await host.waitForType('scene.applied', 45000)
    await applyViewPreset(host, options.viewPreset)
    await setAvatarEdgeLight(host, options.avatarEdgeLight)
    await captureRenderStageViews(host, godot, options)
  }
  finally {
    await stopGodot(host, godot)
    await host.close()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
