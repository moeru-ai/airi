import { defineConfig } from '@moeru/eslint-config'

export default defineConfig({
  preferArrow: false,
  typescript: true,
  unocss: true,
  vue: true,
}, {
  ignores: [
    'cspell.config.yaml',
    'cspell.config.yml',
    'crowdin.yaml',
    'crowdin.yml',
    '**/assets/js/**',
    '**/assets/live2d/models/**',
    'apps/stage-tamagotchi/out/**',
    'apps/stage-tamagotchi/src/bindings/**',
    'apps/stage-tamagotchi/src-tauri/**',
    'apps/stage-tamagotchi-electron/out/**',
    'apps/stage-tamagotchi-electron/src/renderer/bindings/**',
    'crates/**',
    '**/drizzle/**',
    '**/.astro/**',
  ],
}, {
  rules: {
    'antfu/import-dedupe': 'error',
    // TODO: remove this
    'depend/ban-dependencies': 'warn',
    'import/order': 'off',
    'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    'style/padding-line-between-statements': 'error',
    'vue/prefer-separate-static-class': 'off',
    'yaml/plain-scalar': 'off',
  },
})
