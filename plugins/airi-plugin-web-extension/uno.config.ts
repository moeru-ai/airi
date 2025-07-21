import { mergeConfigs } from 'unocss'

import { sharedUnoConfig } from '../../uno.config'

export default mergeConfigs([
  sharedUnoConfig(),
])
