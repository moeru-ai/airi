import type { CapacitorConfig } from '@capacitor/cli'

import { env } from 'node:process'

const serverURL = env.CAPACITOR_DEV_SERVER_URL

const config: CapacitorConfig = {
  appId: 'ai.moeru.airi',
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
