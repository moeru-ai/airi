import { isUrlMode } from './environment'

export function isUrl(url: string) {
  return URL.canParse(url)
}

export function withBase(url: string) {
  if (isUrlMode('server')) {
    return url
  }

  const isAbsolute = url.startsWith('/')
  const isRelative = url.startsWith('./')
  if (isAbsolute) return `.${url}`
  if (isRelative) return url
  return `./${url}`
}
