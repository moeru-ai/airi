declare module 'virtual:settings-search-providers' {
  import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

  /** The runtime item provider of each settings route, by route path. `@proj-airi/stage-pages/vite/settings-search` generates it. */
  const providers: Readonly<Record<string, () => Promise<SettingsSearchProvider>>>
  export default providers
}
