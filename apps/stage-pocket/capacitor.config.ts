import type { CapacitorConfig } from '@capacitor/cli'

import { argv, env } from 'node:process'

const serverURL = env.CAPACITOR_DEV_SERVER_URL

const appId = argv.includes('android') ? 'ai.moeru.airi_pocket' : 'ai.moeru.airi-pocket'

const config: CapacitorConfig = {
  android: {
    buildOptions: {
      keystoreAlias: env.CAPACITOR_ANDROID_KEYSTORE_ALIAS,
      keystoreAliasPassword: env.CAPACITOR_ANDROID_KEYSTORE_ALIAS_PASSWORD,
      keystorePassword: env.CAPACITOR_ANDROID_KEYSTORE_PASSWORD,
      keystorePath: env.CAPACITOR_ANDROID_KEYSTORE_PATH,
      releaseType: 'APK',
      signingType: 'apksigner',
    },
  },
  appId,
  appName: 'AIRI',
  server: serverURL
    ? {
        cleartext: false,
        url: serverURL,
      }
    : undefined,
  webDir: 'dist',
}

export default config
