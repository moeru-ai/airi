import { defineConfig, mergeConfigs, presetIcons, presetWebFonts } from 'unocss'

import UnoCSSConfig from '../../uno.config'

export default defineConfig(mergeConfigs([
  UnoCSSConfig,
  {
    presets: [
      presetWebFonts({
        fonts: {
          sans: 'DM Sans',
          serif: 'DM Serif Display',
          mono: 'DM Mono',
        },
      }),
      presetIcons({
        scale: 1.2,
      }),
    ],
  },
]))
