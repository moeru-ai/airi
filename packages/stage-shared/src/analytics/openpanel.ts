/** Public write configuration shared by AIRI client surfaces. Never add a client secret here. */
export const OPENPANEL_CONFIG = {
  apiUrl: 'https://analytics.airi.build/api',
  clientId: 'f930f223-4a46-4064-b919-1a5465dbc029',
} as const

/**
 * Origins that the installed apps report as the site of their pages.
 *
 * The page of an installed app has no web address. OpenPanel groups pages by origin and path, so each app gets an
 * origin of its own. These hosts are names only. No server answers them.
 */
export const OPENPANEL_APP_ORIGINS = {
  electron: 'https://desktop.airi.moeru.ai',
  mobile: 'https://pocket.airi.moeru.ai',
} as const
