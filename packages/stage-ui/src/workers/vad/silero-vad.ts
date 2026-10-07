import type { PreTrainedModel } from '@huggingface/transformers'
import type { AudioWindow } from '@proj-airi/pipelines-audio'

import { AutoModel, PretrainedConfig, Tensor } from '@huggingface/transformers'

/** Owns model inference state. Speech admission and recording remain outside the model. */
export class SileroVad {
  private readonly model: Promise<PreTrainedModel>
  private state = new Tensor('float32', new Float32Array(256), [2, 1, 128])
  private readonly sampleRate = new Tensor('int64', [16000], [])
  private processing: Promise<unknown> = Promise.resolve()
  private closed = false

  constructor() {
    this.model = AutoModel.from_pretrained('onnx-community/silero-vad', { config: new PretrainedConfig({ model_type: 'custom' }), dtype: 'fp32' })
    void this.model.catch(() => {})
  }

  score(window: AudioWindow, signal: AbortSignal): Promise<number> {
    const result = this.processing.then(async () => {
      signal.throwIfAborted()
      if (this.closed)
        throw new Error('VAD model is closed')
      if (window.sampleRate !== 16000 || window.channels[0]?.length !== 512)
        throw new Error('Silero VAD requires 512 samples at 16 kHz')
      const model = await this.model
      signal.throwIfAborted()
      if (window.discontinuity) {
        this.state.dispose()
        this.state = new Tensor('float32', new Float32Array(256), [2, 1, 128])
      }
      const mono = new Float32Array(512)
      for (const channel of window.channels) {
        for (let index = 0; index < mono.length; index++)
          mono[index] += channel[index] / window.channels.length
      }
      const input = new Tensor('float32', mono, [1, mono.length])
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
