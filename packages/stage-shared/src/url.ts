import { isUrlMode } from './environment'

export function isUrl(url: string) {
  return URL.canParse(url)
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
