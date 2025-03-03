import { ofetch } from 'ofetch'

import { logger } from './logger'

/**
 * 创建一个预配置的 ofetch 实例
 *
 * @param baseURL - API 的基础 URL
 * @param options - 附加选项
 * @returns - 定制的 ofetch 实例
 */
export function createApiClient(baseURL: string, options: Record<string, any> = {}) {
  const client = ofetch.create({
    baseURL,
    retry: 1,
    timeout: 30000, // 默认 30 秒超时
    ...options,

    // 请求拦截器
    onRequest({ request, options }) {
      const method = options.method || 'GET'
      const url = request.toString()
      logger.browser.withFields({ method, url }).debug('API 请求')
    },

    // 请求错误拦截器
    onRequestError({ request, error, options }) {
      const method = options.method || 'GET'
      const url = request.toString()
      logger.browser.withFields({ method, url }).errorWithError('API 请求失败', error)
    },

    // 响应拦截器
    onResponse({ request, response, options }) {
      const method = options.method || 'GET'
      const url = request.toString()
      const status = response.status

      logger.browser
        .withField('method', method)
        .withField('url', url)
        .withField('status', status)
        .debug('API 响应')
    },

    // 响应错误拦截器
    onResponseError({ request, response, options }) {
      const method = options.method || 'GET'
      const url = request.toString()
      const status = response.status

      logger.browser
        .withField('method', method)
        .withField('url', url)
        .withField('status', status)
        .withField('body', response._data)
        .error('API 响应错误')
    },
  })

  return client
}
