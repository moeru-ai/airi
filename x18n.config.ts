import { globSync } from 'node:fs'
import { join } from 'node:path'

import { defineConfig } from '@x18n/cli'

const LOCALES_DIR = 'packages/i18n/src/locales'
const SOURCE_LOCALE = 'en'

// NOTICE:
// x18n does not find the YAML files in subfolders of a locale, such as `tamagotchi/settings.yaml`.
// `compilePattern` turns `{namespaces}.yaml` into the glob `**.yaml`, which matches one path segment only.
// Source: `packages/builtins/src/finders/pattern.ts` in x18n-dev/x18n, checked on @x18n/cli 0.1.5.
// Remove `nestedResources` when `{namespaces}` finds the files in subfolders.
const nestedResources = globSync('*/**/*.yaml', { cwd: join(import.meta.dirname, LOCALES_DIR, SOURCE_LOCALE) })
  .map(file => file.replaceAll('\\', '/'))
  .sort()
  .map(file => ({
    pattern: `${LOCALES_DIR}/{locale}/${file}`,
    namespace: file.slice(0, -'.yaml'.length).replaceAll('/', '.'),
  }))

export default defineConfig({
  sourceLocale: SOURCE_LOCALE,
  presets: ['vue-i18n'],
  resources: [
    // The `index.ts` files only merge the YAML files, so x18n reads the YAML files alone.
    { pattern: `${LOCALES_DIR}/{locale}/{namespaces}.yaml` },
    ...nestedResources,
  ],
  usage: {
    // Tests pass made-up keys to stub translate functions.
    exclude: ['**/*.test.ts', '**/*.spec.ts'],
  },
  // x18n checks how code uses the keys. Crowdin owns the translated locales, and
  // `.github/scripts/check-locales.ts` checks their content, so these checks stay off here.
  checks: {
    'missing-translation': 'off',
    'stale-translation': 'off',
    'placeholder-mismatch': 'off',
    'identical-to-source': 'off',
  },
  // Translators review on Crowdin.
  review: {
    enabled: false,
  },
})
