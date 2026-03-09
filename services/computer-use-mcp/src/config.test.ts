import { afterEach, describe, expect, it } from 'vitest'

import { resolveComputerUseConfig } from './config'

const originalEnv = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value
  }
})

describe('resolveComputerUseConfig', () => {
  it('parses remote linux-x11 settings from env', () => {
    process.env.COMPUTER_USE_EXECUTOR = 'linux-x11'
    process.env.COMPUTER_USE_REMOTE_SSH_HOST = '20.196.212.37'
    process.env.COMPUTER_USE_REMOTE_SSH_USER = 'airi'
    process.env.COMPUTER_USE_REMOTE_SSH_PORT = '2201'
    process.env.COMPUTER_USE_REMOTE_RUNNER_COMMAND = '~/.local/bin/custom-runner'
    process.env.COMPUTER_USE_REMOTE_DISPLAY_SIZE = '1366x768'
    process.env.COMPUTER_USE_REMOTE_OBSERVATION_BASE_URL = 'http://20.196.212.37:8765/observations'
    process.env.COMPUTER_USE_REMOTE_OBSERVATION_TOKEN = 'observation-token'
    process.env.COMPUTER_USE_ALLOWED_BOUNDS = '0,0,1366,768'

    const config = resolveComputerUseConfig()

    expect(config.executor).toBe('linux-x11')
    expect(config.remoteSshHost).toBe('20.196.212.37')
    expect(config.remoteSshUser).toBe('airi')
    expect(config.remoteSshPort).toBe(2201)
    expect(config.remoteRunnerCommand).toBe('~/.local/bin/custom-runner')
    expect(config.remoteDisplaySize).toEqual({
      width: 1366,
      height: 768,
    })
    expect(config.remoteObservationBaseUrl).toBe('http://20.196.212.37:8765/observations')
    expect(config.remoteObservationServePort).toBe(8765)
    expect(config.remoteObservationToken).toBe('observation-token')
    expect(config.allowedBounds).toEqual({
      x: 0,
      y: 0,
      width: 1366,
      height: 768,
    })
    expect(config.permissionChainHint).toContain('ssh -> remote desktop-runner')
    expect(config.requireAllowedBoundsForMutatingActions).toBe(true)
  })

  it('defaults macos-local to deny-only window policy and local shell runner settings', () => {
    process.env.COMPUTER_USE_EXECUTOR = 'macos-local'

    const config = resolveComputerUseConfig()

    expect(config.executor).toBe('macos-local')
    expect(config.openableApps).toEqual(['Terminal', 'Cursor', 'Google Chrome'])
    expect(config.denyApps).toContain('airi')
    expect(config.terminalShell).toBeTruthy()
    expect(config.permissionChainHint).toContain('swift/quartz + open')
    expect(config.requireAllowedBoundsForMutatingActions).toBe(false)
    expect(config.requireCoordinateAlignmentForMutatingActions).toBe(false)
  })
})
