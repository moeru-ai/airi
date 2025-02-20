/* eslint-disable no-restricted-globals */
import type {
  ModelOutput,
  PreTrainedTokenizer,
  Processor,
  ProgressCallback,
  Tensor,
  WhisperModel,
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
  static model: Promise<WhisperModel>

  static async getInstance(progress_callback?: ProgressCallback) {
    this.model_id = 'onnx-community/whisper-base'

    this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, {
      progress_callback,
    })

    this.processor ??= AutoProcessor.from_pretrained(this.model_id, {
      progress_callback,
    })

    this.model ??= WhisperForConditionalGeneration.from_pretrained(this.model_id, {
      dtype: {
        encoder_model: 'fp32', // 'fp16' works too
        decoder_model_merged: 'q4', // or 'fp32' ('fp16' is broken)
      },
      device: 'webgpu',
      progress_callback,
    }) as Promise<unknown> as Promise<WhisperModel>

    return Promise.all([this.tokenizer, this.processor, this.model])
  }
}

let processing = false
async function generate({ audio, language }: { audio: ArrayBuffer, language: string }) {
  if (processing)
    return
  processing = true

  // Tell the main thread we are starting
  self.postMessage({ status: 'start' })

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

    self.postMessage({
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

  const inputs = await processor(audio)

  const outputs = await model.generate({
    ...inputs,
    max_new_tokens: MAX_NEW_TOKENS,
    language,
    streamer,
  })

  const outputText = tokenizer.batch_decode(outputs as Tensor, { skip_special_tokens: true })

  // Send the output back to the main thread
  self.postMessage({
    status: 'complete',
    output: outputText,
  })
  processing = false
}

async function load() {
  self.postMessage({
    status: 'loading',
    data: 'Loading model...',
  })

  // Load the pipeline and save it for future use.
  const [_tokenizer, _processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance((x) => {
    // We also add a progress callback to the pipeline so that we can
    // track model loading.
    self.postMessage(x)
  })

  self.postMessage({
    status: 'loading',
    data: 'Compiling shaders and warming up model...',
  })

  // Run model with dummy input to compile shaders
  await model.generate({
    input_features: full([1, 80, 3000], 0.0),
    max_new_tokens: 1,
  } as Record<string, unknown>)

  self.postMessage({ status: 'ready' })
}
// Listen for messages from the main thread
self.addEventListener('message', async (e) => {
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
