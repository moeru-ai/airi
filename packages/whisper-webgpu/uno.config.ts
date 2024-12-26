import { defineConfig, mergeConfigs, presetWebFonts } from 'unocss'
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
          cute: 'Kiwi Maru',
          cuteen: 'Sniglet',
        },
      }),
    ],
  },
]))
