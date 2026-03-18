import type { CapacitorConfig } from '@capacitor/cli'

import { argv, env } from 'node:process'

const serverURL = env.CAPACITOR_DEV_SERVER_URL

const appId = argv.includes('android') ? 'ai.moeru.airi_pocket' : 'ai.moeru.airi-pocket'

const config: CapacitorConfig = {
  appId,
  appName: 'AIRI',
  webDir: 'dist',
  server: serverURL
    ? {
        url: serverURL,
        cleartext: false,
      }
    : undefined,
}

export default config
