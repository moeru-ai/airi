/* eslint-disable no-restricted-globals */
import type { FeatureExtractionPipeline, FeatureExtractionPipelineOptions } from '@huggingface/transformers'
import type { PipelineOptionsFrom } from '@proj-airi/utils-transformers/types'
import type { WorkerMessageEvent } from '../types'

import { pipeline } from '@huggingface/transformers'
import { defu } from 'defu'

import { MessageStatus } from '../types'
import { supportsWebGPU } from '../utils'

let embed: FeatureExtractionPipeline

async function load(modelId: string, options?: Omit<PipelineOptionsFrom<typeof pipeline<'feature-extraction'>>, 'progress_callback'>) {
  try {
    const device = (await supportsWebGPU()) ? 'webgpu' : 'wasm'

    const opts = defu<PipelineOptionsFrom<typeof pipeline<'feature-extraction'>>, PipelineOptionsFrom<typeof pipeline<'feature-extraction'>>[]>(options, {
      device,
      progress_callback: (progress) => {
        self.postMessage({ type: 'progress', data: { progress } } satisfies WorkerMessageEvent)
      },
    })

    self.postMessage({ type: 'info', data: { message: `Using device: "${device}"` } } satisfies WorkerMessageEvent)
    self.postMessage({ type: 'info', data: { message: 'Loading models...' } } satisfies WorkerMessageEvent)

    // @ts-expect-error - TODO: TS2590: Expression produces a union type that is too complex to represent.
    embed = await pipeline('feature-extraction', modelId, opts)

    self.postMessage({ type: 'status', data: { status: MessageStatus.Ready, message: 'Ready!' } } satisfies WorkerMessageEvent)
  }
  catch (err) {
    self.postMessage({ type: 'error', data: { error: err } } satisfies WorkerMessageEvent)
    throw err
  }
}

async function extract(text: string | string[], options?: FeatureExtractionPipelineOptions) {
  const result = await embed(text, options)
  const resultArray = result.tolist()
  self.postMessage({ type: 'extractResult', data: { input: { text, options }, output: { data: Array.from(resultArray[0] || []), dims: result.dims } } } satisfies WorkerMessageEvent)
}

self.addEventListener('message', (event: MessageEvent<WorkerMessageEvent>) => {
  const { type } = event.data

  switch (type) {
    case 'load':
      load(event.data.data.modelId, event.data.data.options)
      break
    case 'extract':
      extract(event.data.data.text, event.data.data.options)
      break
  }
})
