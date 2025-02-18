import { defineConfig, mergeConfigs } from 'unocss'

import UnoCSSConfig from '../../uno.config'

export default defineConfig(mergeConfigs([
  UnoCSSConfig,
]))
