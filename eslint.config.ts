import { defineConfig } from '@moeru/eslint-config'

export default defineConfig({
  oxlint: true,
  // TODO: enable this
  preferArrow: false,
  preferLet: false,
  typescript: true,
  unocss: true,
  vue: true,
}, {
  ignores: [
    '**/assets/js/**',
    '**/assets/live2d/models/**',
    'apps/stage-tamagotchi/out/**',
    'apps/stage-tamagotchi/src-tauri/**',
    'crates/**',
    '**/drizzle/**',
    '**/.astro/**',
  ],
})
