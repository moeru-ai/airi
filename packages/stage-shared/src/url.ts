import { isStageTamagotchi, isStageWeb } from './environment'

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
  if (isStageWeb()) {
    return url
  }
  if (isStageTamagotchi()) {
    return url.startsWith('/')
      ? `.${url}`
      : url.startsWith('./')
        ? url
        : `./${url}`
  }

  throw new Error('Unknown environment')
}
