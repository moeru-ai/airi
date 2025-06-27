import {
  defineConfig,
  presetAttributify,
  presetTypography,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
    presetTypography(),
  ],
  transformers: [
    transformerDirectives({
      applyVariable: ['--at-apply'],
    }),
    transformerVariantGroup(),
  ],
})
