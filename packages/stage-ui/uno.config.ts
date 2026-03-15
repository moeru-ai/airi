import { defineConfig, mergeConfigs } from 'unocss'

import { histoireUnoConfig, sharedUnoConfig } from '../../uno.config'

export default mergeConfigs([
  sharedUnoConfig(),
  histoireUnoConfig(),
  defineConfig({
    // All font configurations are now inherited from the root uno.config.ts
  }),
])
