import type { CommonRequestOptions } from '@xsai/shared'
import type { Voice } from './voice'

import { requestHeaders, requestURL, responseJSON } from '@xsai/shared'

export interface ListVoicesOptions extends Omit<CommonRequestOptions, 'model'> {
  query?: string
}

export interface ListVoicesResponse {
  voices: Voice[]
}

export async function listVoices(options: ListVoicesOptions): Promise<Voice[]> {
  return (options.fetch ?? globalThis.fetch)(requestURL(options.query ? `api/voices?${options.query}` : 'api/voices', options.baseURL), {
    headers: requestHeaders({ ...options.headers }, options.apiKey),
    method: 'GET',
    signal: options.abortSignal,
  })
    .then(responseJSON<ListVoicesResponse>)
    .then(({ voices }) => voices)
}
