import type {
  ModelOutput,
  PreTrainedModel,
  PreTrainedTokenizer,
  Processor,
  ProgressCallback,
  Tensor,
} from '@huggingface/transformers'

import {
  AutoProcessor,
  AutoTokenizer,
  full,
  TextStreamer,
  WhisperForConditionalGeneration,
} from '@huggingface/transformers'

const MAX_NEW_TOKENS = 64

/**
 * This class uses the Singleton pattern to ensure that only one instance of the model is loaded.
 */
class AutomaticSpeechRecognitionPipeline {
  static model_id: string | null = null
  static tokenizer: Promise<PreTrainedTokenizer>
  static processor: Promise<Processor>
  static model: Promise<PreTrainedModel>

  static async getInstance(progress_callback?: ProgressCallback) {
    this.model_id = 'onnx-community/whisper-large-v3-turbo'

    this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, {
      progress_callback,
    })

    this.processor ??= AutoProcessor.from_pretrained(this.model_id, {
      progress_callback,
    })

    this.model ??= WhisperForConditionalGeneration.from_pretrained(this.model_id, {
      dtype: {
        // [v3.x] Cannot load whisper-v3-large-turbo · Issue #989 · huggingface/transformers.js
        // https://github.com/huggingface/transformers.js/issues/989
        encoder_model: 'fp16', // 'fp16' works too
        decoder_model_merged: 'q4', // or 'fp32' ('fp16' is broken)
      },
      device: 'webgpu',
      progress_callback,
    })

    return Promise.all([this.tokenizer, this.processor, this.model])
  }
}

async function base64ToFeatures(base64Audio: string): Promise<Float32Array> {
  // Decode base64 to binary
  const binaryString = atob(base64Audio)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // Skip WAV header (44 bytes) and convert to 16-bit PCM samples
  const samples = new Int16Array(bytes.buffer.slice(44))

  // Convert to Float32Array and normalize to [-1, 1]
  const audio = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    audio[i] = samples[i] / 32768.0
  }

  return audio
}

let processing = false
async function generate({ audio, language }: { audio: string, language: string }) {
  if (processing)
    return
  processing = true

  // Tell the main thread we are starting
  globalThis.postMessage({ status: 'start' })

  const audioData = await base64ToFeatures(audio)

  // Retrieve the text-generation pipeline.
  const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance()

  let startTime
  let numTokens = 0
  const callback_function = (output: ModelOutput | Tensor) => {
    startTime ??= performance.now()

    let tps
    if (numTokens++ > 0) {
      tps = numTokens / (performance.now() - startTime) * 1000
    }

    globalThis.postMessage({
      status: 'update',
      output,
      tps,
      numTokens,
    })
  }

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    decode_kwargs: {
      skip_special_tokens: true,
    },
    callback_function,
  })

  const inputs = await processor(audioData)

  const outputs = await model.generate({
    ...inputs,
    max_new_tokens: MAX_NEW_TOKENS,
    language,
    streamer,
  })

  const outputText = tokenizer.batch_decode(outputs as Tensor, { skip_special_tokens: true })

  // Send the output back to the main thread
  globalThis.postMessage({
    status: 'complete',
    output: outputText,
  })
  processing = false
}

async function load() {
  globalThis.postMessage({
    status: 'loading',
    data: 'Loading model...',
  })

  // Load the pipeline and save it for future use.
  // const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance((x) => {
  const [_tokenizer, _processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance((x) => {
    // We also add a progress callback to the pipeline so that we can
    // track model loading.
    globalThis.postMessage(x)
  })

  globalThis.postMessage({
    status: 'loading',
    data: 'Compiling shaders and warming up model...',
  })

  // Run model with dummy input to compile shaders
  await model.generate({
    // input_features: full([1, 80, 3000], 0.0), // for fp32
    input_features: full([1, 128, 3000], 0.0), // for fp16
    max_new_tokens: 1,
  } as Record<string, unknown>)

  globalThis.postMessage({ status: 'ready' })
}
// Listen for messages from the main thread
globalThis.addEventListener('message', async (e) => {
  const { type, data } = e.data

  switch (type) {
    case 'load':
      load()
      break

    case 'generate':
      generate(data)
      break
  }
})
