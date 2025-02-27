import type { CreateProviderOptions } from '@xsai-ext/shared-providers'
import type { EmbedResponseUsage } from '@xsai/embed'
import type { LoadOptions, WorkerMessageEvent } from './types'

import { merge } from '@xsai-ext/shared-providers'

export interface EmbedProvider<T = string, T2 = undefined> {
  embed: (model: (string & {}) | T, extraOptions?: T2) => T2
}

export type Loadable<P, T = string, T2 = undefined> = P & {
  loadEmbed: (model: (string & {}) | T, options?: T2) => Promise<void>
}

export interface EmbedResponse {
  data: {
    embedding: number[]
    index: number
    object: 'embedding'
  }[]
  model: string
  object: 'list' | (string & {})
  system_fingerprint?: string
  usage: EmbedResponseUsage
}

export function createEmbedProvider<
  T extends string = string,
  T2 = CreateProviderOptions & LoadOptions,
>(createOptions: CreateProviderOptions): Loadable<EmbedProvider<T, T2>, T, T2> {
  let worker: Worker
  let isReady = false

  function loadModel(model: (string & {}) | T, options: T2) {
    return new Promise<void>((resolve, reject) => {
      try {
        const workerURL = new URL(createOptions.baseURL)

        if (!worker)
          worker = new Worker(workerURL.searchParams.get('worker-url')!, { type: 'module' })
        if (!worker)
          throw new Error('Worker not initialized')

        worker.postMessage({ type: 'load', data: { modelId: model, task: 'feature-extraction', options } } satisfies WorkerMessageEvent)
      }
      catch (err) {
        reject(err)
      }

      worker.onmessage = (event: MessageEvent<WorkerMessageEvent>) => {
        switch (event.data.type) {
          case 'error':
            reject(event.data.data.error)
            break
          case 'status':
            if (event.data.data.status === 'ready') {
              isReady = true
              resolve()
            }

            break
        }
      }
    })
  }

  return {
    embed: (model, options) => Object.assign(createOptions, {
      fetch: (_, init: RequestInit) => {
        return new Promise<Response>((resolve, reject) => {
          loadModel(model, options).then(() => {
            if (!worker || !isReady) {
              reject(new Error('Model not loaded'))
              return
            }

            let text: string = ''
            let body: any

            try {
              body = JSON.parse(init.body.toString())
              text = body.input
              delete body.input
            }
            catch (err) {
              reject(err)
              return
            }

            let errored = false
            let resultDone = false

            worker.onmessage = (event: MessageEvent<WorkerMessageEvent>) => {
              switch (event.data.type) {
                case 'error':
                  errored = true
                  reject(event.data.data.error)
                  break
                case 'extractResult':
                  resultDone = true
                  // eslint-disable-next-line no-case-declarations
                  const result = { data: [{ embedding: event.data.data.output.data, index: 0, object: 'embedding' }], model, object: 'list', usage: { prompt_tokens: 0, total_tokens: 0 } } satisfies EmbedResponse
                  // eslint-disable-next-line no-case-declarations
                  const encoder = new TextEncoder()

                  resolve(new Response(encoder.encode(JSON.stringify(result))))
                  break
              }
            }

            if (!errored && !resultDone)
              worker.postMessage({ type: 'extract', data: { text, options: body as any } } satisfies WorkerMessageEvent)
          })
        })
      },
    }) as unknown as T2,
    loadEmbed: loadModel,
  }
}

export function createTransformers(options: { embedWorkerURL: string }) {
  return merge(
    createEmbedProvider<'Xenova/all-MiniLM-L6-v2'>({ baseURL: `xsai-provider-ext:///?worker-url=${options.embedWorkerURL}&other=` }),
  )
}
