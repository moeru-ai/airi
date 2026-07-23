import type { Component } from 'vue'

declare module '@vishot/mockup-desktop-vue' {
  // NOTICE:
  // The published `@vishot/mockup-desktop-vue@0.0.3` JavaScript entry exports
  // these components, but its generated declaration barrel points through
  // missing nested declaration paths.
  // Root cause summary: `dist/components.js` exports the names while
  // `dist/components/index.d.ts` references `./decos`, `./router`, and
  // `./navigator`, which are not emitted as declaration files in npm 0.0.3.
  // Source/context: `node_modules/@vishot/mockup-desktop-vue/dist/components.js`
  // and `dist/components/index.d.ts`.
  // Removal condition: delete this module augmentation after Vishot publishes
  // corrected component declaration barrels.
  export const DecoFocusMask: Component
  export const DecoHighlightRegion: Component
  export const DecoOutlineRegion: Component
  export const DecoProvider: Component
  export const RouterCaptureRoot: Component
  export const RouterProvider: Component
  export const ScenarioCanvas: Component
  export const ScreenNavigator: Component
  export function useSceneReady(sources: string[]): void
}
