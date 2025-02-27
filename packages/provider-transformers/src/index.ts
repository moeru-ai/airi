import type { CreateProviderOptions, EmbedProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { EmbedResponse } from '@xsai/embed'
import type { CommonRequestOptions } from '@xsai/shared'
import type { LoadOptionProgressCallback, LoadOptions, WorkerMessageEvent } from './types'

import { merge } from '@xsai-ext/shared-providers'
import defu from 'defu'

export type Loadable<P, T = string, T2 = undefined> = P & {
  loadEmbed: (model: (string & {}) | T, options?: T2) => Promise<void>
  terminateEmbed: () => void
}

function createEmbedProvider<T extends string, T2 extends Omit<CommonRequestOptions, 'baseURL' | 'model'> & LoadOptions>(createOptions: CreateProviderOptions): Loadable<EmbedProviderWithExtraOptions<T, T2>, T, T2> {
  let worker: Worker
  let isReady = false

  function loadModel(model: (string & {}) | T, options?: T2) {
    return new Promise<void>((resolve, reject) => {
      let onProgress: LoadOptionProgressCallback | undefined
      if (options != null && 'onProgress' in options && options.onProgress != null) {
        onProgress = options?.onProgress
        delete options?.onProgress
      }

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

      worker.addEventListener('message', (event: MessageEvent<WorkerMessageEvent>) => {
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
          case 'progress':
            if (onProgress != null && typeof onProgress === 'function') {
              onProgress(event.data.data.progress)
            }

            break
        }
      })
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

            worker.addEventListener('error', (event: ErrorEvent) => {
              reject(event)
            })

            let text: string = ''
            let body: LoadOptions & { input: string }

            try {
              body = JSON.parse(init.body.toString())
              text = body.input
              delete body.input
              delete body.onProgress
            }
            catch (err) {
              reject(err)
              return
            }

            let errored = false
            let resultDone = false

            worker.addEventListener('message', (event: MessageEvent<WorkerMessageEvent>) => {
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
            })

            if (!errored && !resultDone)
              worker.postMessage({ type: 'extract', data: { text, options: defu<LoadOptions, LoadOptions[]>(options, { pooling: 'mean', normalize: true }) } } satisfies WorkerMessageEvent)
          })
        })
      },
    }) as unknown as Omit<CommonRequestOptions, 'baseURL'> & Partial<T2> as any,
    loadEmbed: loadModel,
    terminateEmbed: () => {
      if (worker) {
        worker.terminate()
        worker = undefined
      }
    },
  }
}

export function createTransformers(options: { embedWorkerURL: string }) {
  return merge(
    createEmbedProvider<'Xenova/all-MiniLM-L6-v2', Omit<CreateProviderOptions, 'baseURL'> & LoadOptions>({ baseURL: `xsai-provider-ext:///?worker-url=${options.embedWorkerURL}&other=true` }),
  )
}
