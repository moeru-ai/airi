/// <reference types="vite/client" />
/// <reference types="../../vite-env.d.ts" />

interface ImportMetaEnv {
  /**
   * Base URL for remote Sherpaw model downloads in the main process.
   * `electron.vite.config.ts` defines it for the main build only. It is undefined in tests and in the renderer.
   */
  readonly SHERPAW_MODEL_ENDPOINT?: string
}
