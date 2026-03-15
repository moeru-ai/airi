import { isUrlMode } from './environment'

export function isUrl(url: string) {
  try {
    // eslint-disable-next-line no-new
    new URL(url)
    return true
  }
  catch {
    return false
  }
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
