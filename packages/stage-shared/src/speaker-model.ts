/**
 * The pinned CAM++ speaker embedding pack for Sherpaw speaker tracking.
 *
 * Its shape matches `SherpawModelArtifacts` in `@proj-airi/provider-inference`.
 * The pack lives here because the Electron main process downloads it on desktop, and main does not import `@proj-airi/stage-ui`.
 * Application Vite configs also import this value, so this module must stay free of runtime imports.
 */
export const speakerModel = {
  id: 'sherpaw-campplus-zh-en-advanced',
  repository: 'moeru-ai/sherpaw-campplus-zh-en-advanced',
  revision: '5fc23543ac94200ae77514cf1c40596c5d70f6e8',
  directory: 'install/bin/wasm',
} as const
