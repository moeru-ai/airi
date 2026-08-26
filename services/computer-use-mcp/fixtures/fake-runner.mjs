import { env, exit, stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline'

// TODO(@nekomeowww): try now to directly embed binary / base64, even tests. `xz` warned us.
const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8vO0AAAAASUVORK5CYII='

const state = {
  displayId: env.FAKE_RUNNER_DISPLAY_ID || ':99',
  height: Number.parseInt(env.FAKE_RUNNER_HEIGHT || '720', 10),
  hostName: env.FAKE_RUNNER_HOST_NAME || 'fake-remote',
  observationBaseUrl: env.FAKE_RUNNER_OBSERVATION_BASE_URL || '',
  remoteUser: env.FAKE_RUNNER_REMOTE_USER || 'airi',
  sessionTag: env.FAKE_RUNNER_SESSION_TAG || 'vm-local-1',
  width: Number.parseInt(env.FAKE_RUNNER_WIDTH || '1280', 10),
}

function displayInfo() {
  return {
    available: true,
    isRetina: false,
    logicalHeight: state.height,
    logicalWidth: state.width,
    note: `managed virtual X session ${state.displayId}`,
    pixelHeight: state.height,
    pixelWidth: state.width,
    platform: 'linux',
    scaleFactor: 1,
  }
}

function executionTarget() {
  return {
    displayId: state.displayId,
    hostName: state.hostName,
    isolated: true,
    mode: 'remote',
    remoteUser: state.remoteUser,
    sessionTag: state.sessionTag,
    tainted: false,
    transport: 'ssh-stdio',
  }
}

function permissionInfo() {
  return {
    accessibility: {
      note: 'linux-x11 runner does not rely on accessibility APIs',
      status: 'unsupported',
      target: `${state.displayId} linux-x11 session`,
    },
    automationToSystemEvents: {
      note: 'linux-x11 runner does not use System Events',
      status: 'unsupported',
      target: `${state.displayId} linux-x11 session`,
    },
    screenRecording: {
      checkedBy: 'scrot',
      status: 'granted',
      target: `${state.displayId} via scrot`,
    },
  }
}

function writeResponse(response) {
  stdout.write(`${JSON.stringify(response)}\n`)
}

const rl = createInterface({
  crlfDelay: Infinity,
  input: stdin,
})

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) {
    return
  }

  const request = JSON.parse(trimmed)
  if (env.FAKE_RUNNER_CLOSE_ON_MUTATION === '1' && ['click', 'pressKeys', 'scroll', 'typeText'].includes(request.method)) {
    exit(1)
  }

  switch (request.method) {
    case 'click':
    case 'pressKeys':
    case 'scroll':
    case 'typeText':
    case 'wait':
      writeResponse({
        id: request.id,
        ok: true,
        result: {
          backend: 'linux-x11',
          executionTarget: executionTarget(),
          notes: [`${request.method} executed`],
          performed: true,
        },
      })
      return
    case 'getDisplayInfo':
      writeResponse({
        id: request.id,
        ok: true,
        result: displayInfo(),
      })
      return
    case 'getExecutionTarget':
      writeResponse({
        id: request.id,
        ok: true,
        result: executionTarget(),
      })
      return
    case 'getForegroundContext':
      writeResponse({
        id: request.id,
        ok: true,
        result: {
          appName: 'mousepad',
          available: true,
          platform: 'linux',
          windowTitle: 'Mousepad',
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
    case 'initialize':
      writeResponse({
        id: request.id,
        ok: true,
        result: {
          displayInfo: displayInfo(),
          executionTarget: executionTarget(),
          permissionInfo: permissionInfo(),
        },
      })
      return
    case 'openTestTarget':
      writeResponse({
        id: request.id,
        ok: true,
        result: {
          appName: 'mousepad',
          executionTarget: executionTarget(),
          launched: true,
          recommendedClickPoint: {
            x: 180,
            y: 150,
          },
          windowTitle: 'Mousepad',
        },
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
          executionTarget: executionTarget(),
          height: state.height,
          width: state.width,
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
      exit(0)
  }
})
