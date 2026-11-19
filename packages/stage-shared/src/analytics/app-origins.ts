import type { StageEnvironment } from '../environment'

/**
 * Origins that the installed apps report as the site of their pages, by stage environment.
 *
 * The page of an installed app has no web address. A desktop page is a `file:` URL that holds a directory of the
 * user's computer. Each analytics provider therefore reports the app pages under these origins. These hosts are
 * names only. No server answers them. The web app has no entry, because it reports its real origin.
 */
export const ANALYTICS_APP_ORIGINS: Partial<Record<`${StageEnvironment}`, string>> = {
  tamagotchi: 'https://desktop.airi.moeru.ai',
  capacitor: 'https://pocket.airi.moeru.ai',
}
