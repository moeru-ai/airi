import {
  createAudioTestAPI,
  createAudioTestTask,
  runAudioTestSession,
} from '@proj-airi/vitest-plugin-fakemic'
import { describe, expect, it, vi } from 'vitest'

const calls: string[] = []
const audio = createAudioTestAPI<
  { preflight?: readonly ((context: { value: string }) => void)[], value: string },
  { value: string },
  { capturedValue: string },
  { value: string }
>({
  createPlans: (name, definition) => [{
    definition,
    metadata: {
      input: '/fixtures/input.wav',
      runtime: 'mock',
    },
    name: `mock: ${name}`,
  }],
  async execute({ invokeHandler, plan, runPreflight, task }) {
    await runPreflight({ value: 'preflight' })
    Object.assign(task.context, {
      capturedValue: plan.definition.value,
    })
    await invokeHandler()
  },
  preflight: definition => definition.preflight,
})

audio.describe('createAudioTestAPI', () => {
  audio.it('runs preflight before a registered task', {
    preflight: [({ value }) => calls.push(value)],
    value: 'captured',
  }, ({ capturedValue }) => {
    expect(calls).toEqual(['preflight'])
    expect(capturedValue).toBe('captured')
  })
})

describe('audio test tasks', () => {
  it('creates one task for the current runtime project', () => {
    const input = new URL('file:///audio/input.wav')
    const task = createAudioTestTask('captures speech', { input })

    expect(task).toEqual({ input, name: 'captures speech' })
  })

  it('records artifacts before it closes the session', async () => {
    const calls: string[] = []
    const session = {
      close: vi.fn(async () => {
        calls.push('close')
      }),
    }

    await runAudioTestSession({
      execute: async () => {
        calls.push('execute')
      },
      recordArtifacts: async () => {
        calls.push('record')
      },
      start: async () => session,
    })

    expect(calls).toEqual(['execute', 'record', 'close'])
  })

  it('closes the session and keeps execution and cleanup failures', async () => {
    const executionError = new Error('execution failed')
    const closeError = new Error('close failed')

    const result = runAudioTestSession({
      execute: async () => {
        throw executionError
      },
      start: async () => ({
        close: async () => {
          throw closeError
        },
      }),
    })

    await expect(result).rejects.toMatchObject({
      errors: [executionError, closeError],
    })
  })
})
