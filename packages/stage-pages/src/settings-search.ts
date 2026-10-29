import type { SettingsSearchModuleSource } from '@proj-airi/stage-ui/libs/settings-search'

/**
 * The settings search modules of the shared settings pages, by name.
 *
 * A module with items loads from its own chunk when a settings home opens. A module of an area, such as `settings:modules`,
 * holds the pages of the area that have no module of their own.
 *
 * Use when:
 * - An app provides its modules to `settingsSearch` from `@proj-airi/stage-ui/libs/settings-search` at startup.
 *   It spreads this record into its own, then provides each entry.
 *
 * Expects:
 * - An app that replaces a shared page with a different page puts its own module under the same name, such as `settings:data`.
 */
export const settingsSearchModules: Readonly<Record<string, SettingsSearchModuleSource>> = {
  'settings:account': { routes: ['/settings/account'] },
  'settings:airi-card': () => import('./pages/settings/airi-card/index.search'),
  'settings:capacitor': { routes: ['/settings/capacitor'] },
  'settings:connection': { routes: ['/settings/connection'] },
  'settings:data': () => import('./pages/settings/data/index.search'),
  'settings:flux': { routes: ['/settings/flux'] },
  'settings:memory': { routes: ['/settings/memory'] },
  'settings:models': () => import('./pages/settings/models/index.search'),
  'settings:modules': { routes: ['/settings/modules'] },
  'modules:consciousness': () => import('./pages/settings/modules/consciousness.search'),
  'modules:speech': () => import('./pages/settings/modules/speech.search'),
  'modules:transcriber': () => import('./pages/settings/modules/hearing/transcriber.search'),
  'modules:wake-words': () => import('./pages/settings/modules/hearing/wake-words.search'),
  'modules:vision': () => import('./pages/settings/modules/vision.search'),
  'modules:stickers': () => import('./pages/settings/modules/stickers.search'),
  'modules:tool-cards': () => import('./pages/settings/modules/tool-cards.search'),
  'modules:memories': () => import('./pages/settings/modules/memory-long-term-memories.search'),
  'modules:recipes': () => import('./pages/settings/modules/memory-long-term-recipes.search'),
  'settings:providers': () => import('./pages/settings/providers/index.search'),
  'providers:comfyui': () => import('./pages/settings/providers/artistry/comfyui.search'),
  'settings:scene': () => import('./pages/settings/scene/index.search'),
  'settings:system': { routes: ['/settings/system'] },
  'system:experimental': () => import('./pages/settings/system/experimental.search'),
}
