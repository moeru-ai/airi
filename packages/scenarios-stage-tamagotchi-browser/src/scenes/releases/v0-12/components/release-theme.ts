import type { InjectionKey } from 'vue'

/**
 * The color theme of a release area. Each area renders once per theme.
 * A light area uses screenshots of the light app theme, and a dark area uses the dark ones.
 */
export type ReleaseTheme = 'dark' | 'light'

export const releaseThemes: ReleaseTheme[] = ['dark', 'light']

export const releaseThemeKey: InjectionKey<ReleaseTheme> = Symbol('release-theme')
