import { inject } from 'vue'

import { releaseThemeKey } from './release-theme'

export interface ReleaseShot {
  /** The screenshot of the dark app theme. */
  dark: string
  /** The screenshot of the light app theme. A shot without it looks the same in both themes. */
  light?: string
  /** The CSS width of the screen that took the screenshot. */
  width: number
}

/** Returns the image URLs of the shots, so a scene can wait until all of them load. */
export function releaseShotSourcesOf(shots: Record<string, ReleaseShot>) {
  return Object.values(shots).flatMap(shot => shot.light ? [shot.dark, shot.light] : [shot.dark])
}

/** Returns a function that selects the screenshot of the theme of the current area. */
export function useReleaseShot() {
  const theme = inject(releaseThemeKey, 'dark')
  return (shot: ReleaseShot) => (theme === 'light' ? shot.light : undefined) ?? shot.dark
}
