import { mergeConfigs } from 'unocss'

import { histoireUnoConfig, sharedUnoConfig } from '../../uno.config'

export default mergeConfigs([
  sharedUnoConfig(),
  histoireUnoConfig(),
])
