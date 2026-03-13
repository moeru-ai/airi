import type { CapacitorConfig } from '@capacitor/cli'

import { argv, env } from 'node:process'

const serverURL = env.CAPACITOR_DEV_SERVER_URL

let appId = 'ai.moeru.airi-pocket'

if (argv.includes('android')) {
  appId = 'ai.moeru.airi_pocket'
}
else {
  appId = 'ai.moeru.airi-pocket'
}

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
