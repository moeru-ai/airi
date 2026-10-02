import type { IOTraceRecordingState, SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { randomUUID } from 'node:crypto'

import { errorMessageFrom } from '@moeru/std'

import { IOTraceCaptureWriter } from './capture'

interface IOTraceRecordingServiceOptions {
  capturesDirectory: string
  getStoredEnabled: () => boolean
  setStoredEnabled: (enabled: boolean) => void
  now?: () => Date
}

function createCaptureId(now: Date) {
  return `${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
}

export class IOTraceRecordingService {
  private readonly listeners = new Set<(state: IOTraceRecordingState) => void>()
  private capture: IOTraceCaptureWriter | undefined
  private error: string | undefined
  private transition = Promise.resolve()

  constructor(private readonly options: IOTraceRecordingServiceOptions) {}

  getState(): IOTraceRecordingState {
    return {
      captureId: this.capture?.captureId,
      capturePath: this.capture?.captureDirectory,
      capturesDirectory: this.options.capturesDirectory,
      enabled: this.capture !== undefined,
      error: this.error,
    }
  }

  onStateChange(listener: (state: IOTraceRecordingState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async restore(): Promise<void> {
    if (!this.options.getStoredEnabled())
      return
    await this.start()
  }

  setEnabled(enabled: boolean): Promise<IOTraceRecordingState> {
    return this.runTransition(async () => {
      if (enabled)
        await this.start()
      else
        await this.stop()

      this.options.setStoredEnabled(enabled)
      return this.getState()
    })
  }

  async recordSpan(span: SerializedIOSpan): Promise<boolean> {
    const capture = this.capture
    if (!capture)
      return false

    try {
      await capture.appendSpan(span)
      return true
    }
    catch (error) {
      this.error = errorMessageFrom(error) ?? 'Failed to record an IO trace span.'
      this.emitState()
      throw error
    }
  }

  async getRecordedSpans(): Promise<SerializedIOSpan[]> {
    const capture = this.capture
    if (!capture)
      return []
    return (await capture.read()).spans.map(item => item.span)
  }

  async dispose(): Promise<void> {
    await this.runTransition(() => this.stop())
  }

  private runTransition<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transition.then(operation, operation)
    this.transition = result.then(() => undefined, () => undefined)
    return result
  }

  private async start(): Promise<void> {
    if (this.capture)
      return

    this.error = undefined
    const now = this.options.now?.() ?? new Date()
    try {
      this.capture = await IOTraceCaptureWriter.start({
        captureId: createCaptureId(now),
        capturesDirectory: this.options.capturesDirectory,
        now: this.options.now,
      })
      this.emitState()
    }
    catch (error) {
      this.error = errorMessageFrom(error) ?? 'Failed to start IO trace recording.'
      this.emitState()
      throw error
    }
  }

  private async stop(): Promise<void> {
    const capture = this.capture
    if (!capture)
      return

    await capture.stop()
    this.capture = undefined
    this.error = undefined
    this.emitState()
  }

  private emitState() {
    const state = this.getState()
    for (const listener of this.listeners)
      listener(state)
  }
}
