/**
 * The pinned CAM++ speaker embedding pack for Sherpaw speaker tracking.
 *
 * Its shape matches `SherpawModelArtifacts` in `@proj-airi/provider-inference`.
 * Application Vite configs import this value to bundle or expose the pack, so this module must stay free of runtime imports.
 */
export const speakerModel = {
  id: 'sherpaw-campplus-zh-en-advanced',
  repository: 'moeru-ai/sherpaw-campplus-zh-en-advanced',
  revision: '5fc23543ac94200ae77514cf1c40596c5d70f6e8',
  directory: 'install/bin/wasm',
} as const
