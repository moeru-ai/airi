import { mergeConfigs } from 'unocss'

import { histoireUnoConfig, sharedUnoConfig } from '../../uno.config'

export default mergeConfigs([
  sharedUnoConfig(),
  histoireUnoConfig(),
  {
    rules: [
      ['transition-colors-none', {
        'transition-property': 'color, background-color, border-color, text-color',
        'transition-duration': '0s',
      }],
    ],
  },
])
