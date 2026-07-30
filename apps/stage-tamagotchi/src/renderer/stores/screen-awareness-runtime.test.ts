import type {
  ScreenAwarenessRuntimeOptions,
  ScreenAwarenessRuntimeStatus,
} from './screen-awareness-runtime'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ScreenAwarenessRuntime } from './screen-awareness-runtime'

/**
 * 创建屏幕感知运行时测试夹具，并暴露所有外部边界的可断言模拟函数
 *
 * @param optionOverrides 需要覆盖的调度与重试选项
 * @returns 运行时实例以及忙碌判断、观察、回应和状态通知模拟函数
 */
function createRuntimeFixture(optionOverrides: Partial<ScreenAwarenessRuntimeOptions> = {}) {
  const isBusy = vi.fn<() => boolean>(() => false)
  const observe = vi.fn<(abortSignal: AbortSignal) => Promise<string>>(async () => 'screen description')
  const respond = vi.fn<(description: string, abortSignal: AbortSignal) => Promise<string>>(async () => 'character response')
  const onResponse = vi.fn<(response: string) => void>()
  const onStatus = vi.fn<(status: ScreenAwarenessRuntimeStatus) => void>()

  const runtime = new ScreenAwarenessRuntime({
    isBusy,
    observe,
    respond,
    onResponse,
    onStatus,
  }, {
    getIntervalMs: () => 1_000,
    busyRetryDelayMs: 200,
    visionRetryBaseDelayMs: 100,
    ...optionOverrides,
  })

  return {
    runtime,
    isBusy,
    observe,
    respond,
    onResponse,
    onStatus,
  }
}

describe('screenAwarenessRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 starts periodic observation and clears the timer after stop', async () => {
    const { runtime, observe, onResponse } = createRuntimeFixture()

    runtime.start()

    expect(runtime.isRunning()).toBe(true)
    expect(observe).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(observe).toHaveBeenCalledTimes(1)
    expect(onResponse).toHaveBeenCalledWith('character response')

    runtime.stop()

    expect(runtime.isRunning()).toBe(false)

    await vi.advanceTimersByTimeAsync(5_000)

    expect(observe).toHaveBeenCalledTimes(1)
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 ignores repeated start calls instead of creating duplicate timers', async () => {
    const { runtime, observe, onStatus } = createRuntimeFixture()

    runtime.start()
    runtime.start()

    expect(vi.getTimerCount()).toBe(1)
    expect(onStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)

    expect(observe).toHaveBeenCalledTimes(1)

    runtime.stop()
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 reuses one in-flight observation for concurrent manual requests', async () => {
    const { runtime, observe, respond, onResponse } = createRuntimeFixture()
    const observation = Promise.withResolvers<string>()
    observe.mockReturnValue(observation.promise)

    const firstRequest = runtime.requestNow()
    const secondRequest = runtime.requestNow()

    expect(secondRequest).toBe(firstRequest)
    expect(observe).toHaveBeenCalledTimes(1)

    observation.resolve('shared screen description')
    await Promise.all([firstRequest, secondRequest])

    expect(respond).toHaveBeenCalledTimes(1)
    expect(respond).toHaveBeenCalledWith('shared screen description', expect.any(AbortSignal))
    expect(onResponse).toHaveBeenCalledTimes(1)
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 defers scheduled observation while normal conversation is busy', async () => {
    const { runtime, isBusy, observe, onStatus } = createRuntimeFixture()
    isBusy.mockReturnValueOnce(true).mockReturnValue(false)

    runtime.start()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(observe).not.toHaveBeenCalled()
    expect(onStatus).toHaveBeenCalledWith({ phase: 'waiting', trigger: 'scheduled' })

    await vi.advanceTimersByTimeAsync(199)
    expect(observe).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(observe).toHaveBeenCalledTimes(1)

    runtime.stop()
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 limits empty Vision results to three attempts', async () => {
    const { runtime, observe, respond, onResponse, onStatus } = createRuntimeFixture()
    observe.mockResolvedValue('   ')

    const request = runtime.requestNow()
    await vi.runAllTimersAsync()
    await request

    expect(observe).toHaveBeenCalledTimes(3)
    expect(respond).not.toHaveBeenCalled()
    expect(onResponse).not.toHaveBeenCalled()
    expect(onStatus).toHaveBeenLastCalledWith({
      phase: 'error',
      trigger: 'manual',
      error: 'Vision returned an empty screen description',
    })
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 limits empty character responses to two attempts', async () => {
    const { runtime, respond, onResponse, onStatus } = createRuntimeFixture()
    respond.mockResolvedValue('   ')

    await runtime.requestNow()

    expect(respond).toHaveBeenCalledTimes(2)
    expect(onResponse).not.toHaveBeenCalled()
    expect(onStatus).toHaveBeenLastCalledWith({
      phase: 'error',
      trigger: 'manual',
      error: 'Character returned an empty screen-awareness response',
    })
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 does not publish an old response after stop invalidates its generation', async () => {
    const { runtime, respond, onResponse } = createRuntimeFixture()
    const response = Promise.withResolvers<string>()
    respond.mockReturnValue(response.promise)

    runtime.start()
    const request = runtime.requestNow()
    await vi.advanceTimersByTimeAsync(0)

    expect(respond).toHaveBeenCalledTimes(1)

    runtime.stop()
    response.resolve('stale character response')
    await request

    expect(onResponse).not.toHaveBeenCalled()
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 does not publish an old error after stop invalidates its generation', async () => {
    const { runtime, observe, onStatus } = createRuntimeFixture()
    const observation = Promise.withResolvers<string>()
    observe.mockReturnValue(observation.promise)

    runtime.start()
    const request = runtime.requestNow()
    runtime.stop()
    observation.reject(new Error('stale observation failure'))
    await request

    expect(onStatus).not.toHaveBeenCalledWith({
      phase: 'error',
      trigger: 'manual',
      error: 'stale observation failure',
    })
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 aborts an in-flight observation when screen awareness stops', async () => {
    const { runtime, observe, respond, onStatus } = createRuntimeFixture()
    let observationSignal: AbortSignal | undefined
    observe.mockImplementation((signal: AbortSignal) => new Promise<string>((_, reject) => {
      observationSignal = signal
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))

    runtime.start()
    const request = runtime.requestNow()
    runtime.stop()
    await request

    expect(observationSignal?.aborted).toBe(true)
    expect(respond).not.toHaveBeenCalled()
    expect(onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ phase: 'error' }))
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 resumes scheduling after stop and start while an old task is in flight', async () => {
    const { runtime, observe } = createRuntimeFixture()
    const observation = Promise.withResolvers<string>()
    observe.mockReturnValueOnce(observation.promise)

    runtime.start()
    const oldRequest = runtime.requestNow()
    runtime.stop()
    runtime.start()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(observe).toHaveBeenCalledTimes(1)

    observation.resolve('old screen description')
    await oldRequest
    await vi.advanceTimersByTimeAsync(1_000)

    expect(observe).toHaveBeenCalledTimes(2)
    runtime.stop()
  })

  // 回归链接：https://github.com/moeru-ai/airi/issues/2060
  it('issue #2060 restores idle after a disabled manual observation is skipped as busy', async () => {
    const { runtime, isBusy, onStatus } = createRuntimeFixture()
    isBusy.mockReturnValue(true)

    await runtime.requestNow()

    expect(onStatus).toHaveBeenNthCalledWith(1, { phase: 'waiting', trigger: 'manual' })
    expect(onStatus).toHaveBeenNthCalledWith(2, { phase: 'idle', trigger: 'manual' })
  })
})
