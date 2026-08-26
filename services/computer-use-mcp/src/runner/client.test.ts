import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import { RemoteRunnerClient } from './client'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fakeRunnerPath = resolve(packageDir, 'fixtures/fake-runner.mjs')

function createFakeRunnerTransport(env: NodeJS.ProcessEnv = {}) {
  return () => ({
    command: process.execPath,
    args: [fakeRunnerPath],
    env: {
      ...process.env,
      ...env,
    },
  })
}

describe('remoteRunnerClient', () => {
  it('connects to a runner and returns remote execution metadata', async () => {
    const client = new RemoteRunnerClient(createTestConfig(), {
      transportFactory: createFakeRunnerTransport({
        FAKE_RUNNER_OBSERVATION_BASE_URL: 'http://fake-remote:8765/observations/vm-local-1',
      }),
    })

    try {
      const target = await client.getExecutionTarget()
      const screenshot = await client.takeScreenshot({
        label: 'client-test',
      })

      expect(target.mode).toBe('remote')
      expect(target.transport).toBe('ssh-stdio')
      expect(target.sessionTag).toBe('vm-local-1')
      expect(target.displayId).toBe(':99')
      expect(screenshot.width).toBe(1280)
      expect(screenshot.executionTarget.hostName).toBe('fake-remote')
      expect(screenshot.publicUrl).toBe('http://fake-remote:8765/observations/vm-local-1/fake-screenshot.png')
    }
    finally {
      await client.close()
    }
  })

  it('keeps the remote session tainted until a fresh screenshot succeeds', async () => {
    let closeOnMutation = true
    const client = new RemoteRunnerClient(createTestConfig(), {
      transportFactory: () => ({
        command: process.execPath,
        args: [fakeRunnerPath],
        env: {
          ...process.env,
          ...(closeOnMutation ? { FAKE_RUNNER_CLOSE_ON_MUTATION: '1' } : {}),
        },
      }),
    })

    try {
      await client.getExecutionTarget()
      await expect(client.click({
        x: 180,
        y: 150,
        pointerTrace: [{ x: 180, y: 150, delayMs: 0 }],
      })).rejects.toThrow()

      const taintedTarget = await client.getExecutionTarget()
      expect(taintedTarget.tainted).toBe(true)

      closeOnMutation = false
      await client.takeScreenshot({
        label: 'fresh-screenshot',
      })
      const recoveredTarget = await client.getExecutionTarget()
      expect(recoveredTarget.tainted).toBe(false)
    }
    finally {
      await client.close().catch(() => {})
    }
  })
})
