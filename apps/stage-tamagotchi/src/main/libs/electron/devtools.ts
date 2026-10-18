import { env } from 'node:process'

import { is } from '@electron-toolkit/utils'

/**
 * Tells whether a window opens its DevTools when it is created.
 *
 * `APP_DEBUG` and `MAIN_APP_DEBUG` opt in when they are set to any value except
 * `0`. Either flag set to `0` opts out and wins over the other flag and over
 * the development mode.
 */
export function shouldOpenDevTools(): boolean {
  const optedOut = env.APP_DEBUG === '0' || env.MAIN_APP_DEBUG === '0'
  if (optedOut)
    return false

  return Boolean(is.dev || env.APP_DEBUG || env.MAIN_APP_DEBUG)
}
