console.warn('@proj-airi/plugin-sdk is currently working in progress. APIs may change without warning.')

export * from './plugin'
/**
 * Re-exports the plugin bootstrap contracts from the package root.
 *
 * Use when:
 * - Consumers want the high-level plugin authoring types from `@proj-airi/plugin-sdk`
 *
 * Expects:
 * - Downstream code imports from the package root instead of the internal path
 *
 * Returns:
 * - The `ContextInit` and `Plugin` types from `./plugin/shared`
 */
export type { ContextInit, Plugin } from './plugin/shared'
