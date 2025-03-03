import { ofetch } from 'ofetch'

import { logger } from './logger'

/**
 * Create a pre-configured ofetch instance
 *
 * @param baseURL - Base URL for the API
 * @param options - Additional options
 * @returns - Customized ofetch instance
 */
export function createApiClient(baseURL: string, options: Record<string, any> = {}) {
  const client = ofetch.create({
    baseURL,
    retry: 1,
    timeout: 30000, // Default 30 second timeout
    ...options,

    // Request interceptor
    onRequest({ request, options }) {
      const method = options.method || 'GET'
      const url = request.toString()
      logger.browser.withFields({ method, url }).debug('API request')
    },

    // Request error interceptor
    onRequestError({ request, error, options }) {
      const method = options.method || 'GET'
      const url = request.toString()
      logger.browser.withFields({ method, url }).errorWithError('API request failed', error)
    },

    // Response interceptor
    onResponse({ request, response, options }) {
      const method = options.method || 'GET'
      const url = request.toString()
      const status = response.status

      logger.browser
        .withField('method', method)
        .withField('url', url)
        .withField('status', status)
        .debug('API response')
    },

    // Response error interceptor
    onResponseError({ request, response, options }) {
      const method = options.method || 'GET'
      const url = request.toString()
      const status = response.status

      logger.browser
        .withField('method', method)
        .withField('url', url)
        .withField('status', status)
        .withField('body', response._data)
        .error('API response error')
    },
  })

  return client
}
