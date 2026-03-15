import { createInterface } from 'node:readline'

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8vO0AAAAASUVORK5CYII='

const state = {
  sessionTag: process.env.FAKE_RUNNER_SESSION_TAG || 'vm-local-1',
  displayId: process.env.FAKE_RUNNER_DISPLAY_ID || ':99',
  hostName: process.env.FAKE_RUNNER_HOST_NAME || 'fake-remote',
  remoteUser: process.env.FAKE_RUNNER_REMOTE_USER || 'airi',
  width: Number.parseInt(process.env.FAKE_RUNNER_WIDTH || '1280', 10),
  height: Number.parseInt(process.env.FAKE_RUNNER_HEIGHT || '720', 10),
  observationBaseUrl: process.env.FAKE_RUNNER_OBSERVATION_BASE_URL || '',
}

function executionTarget() {
  return {
    mode: 'remote',
    transport: 'ssh-stdio',
    hostName: state.hostName,
    remoteUser: state.remoteUser,
    displayId: state.displayId,
    sessionTag: state.sessionTag,
    isolated: true,
    tainted: false,
  }
}

function permissionInfo() {
  return {
    screenRecording: {
      status: 'granted',
      target: `${state.displayId} via scrot`,
      checkedBy: 'scrot',
    },
    accessibility: {
      status: 'unsupported',
      target: `${state.displayId} linux-x11 session`,
      note: 'linux-x11 runner does not rely on accessibility APIs',
    },
    automationToSystemEvents: {
      status: 'unsupported',
      target: `${state.displayId} linux-x11 session`,
      note: 'linux-x11 runner does not use System Events',
    },
  }
}

function displayInfo() {
  return {
    available: true,
    platform: 'linux',
    logicalWidth: state.width,
    logicalHeight: state.height,
    pixelWidth: state.width,
    pixelHeight: state.height,
    scaleFactor: 1,
    isRetina: false,
    note: `managed virtual X session ${state.displayId}`,
  }
}

function writeResponse(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) {
    return
  }

  const request = JSON.parse(trimmed)
  if (process.env.FAKE_RUNNER_CLOSE_ON_MUTATION === '1' && ['click', 'typeText', 'pressKeys', 'scroll'].includes(request.method)) {
    process.exit(1)
  }

  switch (request.method) {
    case 'initialize':
      writeResponse({
        id: request.id,
        ok: true,
        result: {
          executionTarget: executionTarget(),
          displayInfo: displayInfo(),
          permissionInfo: permissionInfo(),
        },
      })
      return
    case 'getExecutionTarget':
      writeResponse({
        id: request.id,
        ok: true,
        result: executionTarget(),
      })
      return
    case 'getDisplayInfo':
      writeResponse({
        id: request.id,
        ok: true,
        result: displayInfo(),
      })
      return
    case 'getForegroundContext':
      writeResponse({
        id: request.id,
        ok: true,
        result: {
          available: true,
          appName: 'mousepad',
          windowTitle: 'Mousepad',
          platform: 'linux',
        },
      })
      return
    case 'getPermissionInfo':
      writeResponse({
        id: request.id,
        ok: true,
        result: permissionInfo(),
      })
      return
    case 'takeScreenshot':
      writeResponse({
        id: request.id,
        ok: true,
        result: {
          dataBase64: tinyPngBase64,
          mimeType: 'image/png',
          ...(state.observationBaseUrl
            ? {
                publicUrl: `${state.observationBaseUrl.replace(/\/$/, '')}/fake-screenshot.png`,
              }
            : {}),
          width: state.width,
          height: state.height,
          executionTarget: executionTarget(),
        },
      })
      return
    case 'click':
    case 'typeText':
    case 'pressKeys':
    case 'scroll':
    case 'wait':
      writeResponse({
        id: request.id,
        ok: true,
        result: {
          performed: true,
          backend: 'linux-x11',
          notes: [`${request.method} executed`],
          executionTarget: executionTarget(),
        },
      })
      return
    case 'openTestTarget':
      writeResponse({
        id: request.id,
        ok: true,
        result: {
          launched: true,
          appName: 'mousepad',
          windowTitle: 'Mousepad',
          recommendedClickPoint: {
            x: 180,
            y: 150,
          },
          executionTarget: executionTarget(),
        },
      })
      return
    case 'shutdown':
      writeResponse({
        id: request.id,
        ok: true,
        result: {
          ok: true,
        },
      })
      process.exit(0)
  }
})
