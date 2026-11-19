import type { PreTrainedModel } from '@huggingface/transformers'

import { AutoModel, PretrainedConfig, Tensor } from '@huggingface/transformers'

/**
 * Owns the Silero VAD model and its recurrent state. The Silero VAD Worker runs it.
 *
 * Each score reads the state of the previous window and replaces it, so scores run one after another in call order.
 */
export class SileroVadModel {
  private readonly model: Promise<PreTrainedModel>
  private state = new Tensor('float32', new Float32Array(256), [2, 1, 128])
  private readonly sampleRate = new Tensor('int64', [16000], [])
  private processing: Promise<unknown> = Promise.resolve()
  private closed = false

  constructor() {
    this.model = AutoModel.from_pretrained('onnx-community/silero-vad', { config: new PretrainedConfig({ model_type: 'custom' }), dtype: 'fp32' })
    void this.model.catch(() => {})
  }

  /**
   * Scores 512 mono samples at 16 kHz. `reset` starts a new state before the window.
   * A window whose signal aborts before its turn is not scored, so it does not change the state.
   */
  score(samples: Float32Array, reset: boolean, signal?: AbortSignal): Promise<number> {
    const result = this.processing.then(async () => {
      signal?.throwIfAborted()
      if (this.closed)
        throw new Error('VAD model is closed')
      const model = await this.model
      signal?.throwIfAborted()
      if (reset) {
        this.state.dispose()
        this.state = new Tensor('float32', new Float32Array(256), [2, 1, 128])
      }
      const input = new Tensor('float32', samples, [1, samples.length])
      try {
        const result = await model({ input, sr: this.sampleRate, state: this.state })
        this.state.dispose()
        this.state = result.stateN
        const score = Number(result.output.data[0])
        result.output.dispose()
        return score
      }
      finally {
        input.dispose()
      }
    })
    this.processing = result.catch(() => {})
    return result
  }

  async close() {
    if (this.closed)
      return
    this.closed = true
    await this.processing
    await this.model.then(model => model.dispose(), () => {})
    this.state.dispose()
    this.sampleRate.dispose()
  }
}
