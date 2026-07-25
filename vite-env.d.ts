/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISABLE_FLUX_PURCHASE?: string
  readonly VITE_DISABLE_CUSTOM_PROVIDERS?: string
  readonly VITE_ENABLE_POSTHOG?: string
  readonly VITE_POSTHOG_PROJECT_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
