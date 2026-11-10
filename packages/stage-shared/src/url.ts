import { isUrlMode } from './environment'

export function isUrl(url: string) {
  return URL.canParse(url)
}

/**
 * Checks whether a string is a valid `http` or `https` URL.
 *
 * Use it before an untrusted URL becomes a link, for example a citation in imported chat history or a web search
 * result. A malformed URL and every other scheme, such as `javascript:`, return `false`.
 *
 * @example
 * isWebUrl('https://example.com/report')
 * // => true
 * isWebUrl('javascript:alert(1)')
 * // => false
 */
export function isWebUrl(url: string): boolean {
  if (!URL.canParse(url))
    return false
  const { protocol } = new URL(url)
  return protocol === 'http:' || protocol === 'https:'
}

export function withBase(url: string) {
  if (isUrlMode('server')) {
    return url
  }

  return url.startsWith('/')
    ? `.${url}`
    : url.startsWith('./')
      ? url
      : `./${url}`
}
