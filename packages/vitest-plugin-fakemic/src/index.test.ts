import {
  createAudioTestAPI,
  createAudioTestTask,
  runAudioTestSession,
} from '@proj-airi/vitest-plugin-fakemic'
import { describe, expect, it, vi } from 'vitest'

const calls: string[] = []
const audio = createAudioTestAPI<
  { value: string, preflight?: readonly ((context: { value: string }) => void)[] },
  { value: string },
  { capturedValue: string },
  { value: string }
>({
  createPlans: (name, definition) => [{
    name: `mock: ${name}`,
    definition,
    metadata: {
      input: '/fixtures/input.wav',
      runtime: 'mock',
    },
  }],
  preflight: definition => definition.preflight,
  async execute({ plan, task, invokeHandler, runPreflight }) {
    await runPreflight({ value: 'preflight' })
    Object.assign(task.context, {
      capturedValue: plan.definition.value,
    })
    await invokeHandler()
  },
})

audio.describe('createAudioTestAPI', () => {
  audio.it('runs preflight before a registered task', {
    value: 'captured',
    preflight: [({ value }) => calls.push(value)],
  }, ({ capturedValue }) => {
    expect(calls).toEqual(['preflight'])
    expect(capturedValue).toBe('captured')
  })
})

describe('audio test tasks', () => {
  it('creates one task for the current runtime project', () => {
    const input = new URL('file:///audio/input.wav')
    const task = createAudioTestTask('captures speech', { input })

    expect(task).toEqual({ name: 'captures speech', input })
  })

  it('records artifacts before it closes the session', async () => {
    const calls: string[] = []
    const session = {
      close: vi.fn(async () => {
        calls.push('close')
      }),
    }

    await runAudioTestSession({
      start: async () => session,
      execute: async () => {
        calls.push('execute')
      },
      recordArtifacts: async () => {
        calls.push('record')
      },
    })

    expect(calls).toEqual(['execute', 'record', 'close'])
  })

  it('closes the session and keeps execution and cleanup failures', async () => {
    const executionError = new Error('execution failed')
    const closeError = new Error('close failed')

    const result = runAudioTestSession({
      start: async () => ({
        close: async () => {
          throw closeError
        },
      }),
      execute: async () => {
        throw executionError
      },
    })

    await expect(result).rejects.toMatchObject({
      errors: [executionError, closeError],
    })
  })
})
