import type { StageEnvironment } from '../environment'

/** Public write configuration shared by AIRI client surfaces. Never add a client secret here. */
export const OPENPANEL_CONFIG = {
  apiUrl: 'https://analytics.airi.build/api',
  clientId: 'f930f223-4a46-4064-b919-1a5465dbc029',
} as const

/**
 * Origins that the installed apps report as the site of their pages, by stage environment.
 *
 * The page of an installed app has no web address. OpenPanel groups pages by origin and path, so each app gets an
 * origin of its own. These hosts are names only. No server answers them. The web app has no entry, because it reports
 * its real origin.
 */
export const OPENPANEL_APP_ORIGINS: Partial<Record<`${StageEnvironment}`, string>> = {
  tamagotchi: 'https://desktop.airi.moeru.ai',
  capacitor: 'https://pocket.airi.moeru.ai',
}
