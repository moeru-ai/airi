/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISABLE_FLUX_PURCHASE?: string
  readonly VITE_DISABLE_CUSTOM_PROVIDERS?: string
  readonly VITE_ENABLE_POSTHOG?: string
  readonly VITE_POSTHOG_PROJECT_KEY_WEB?: string
  readonly VITE_POSTHOG_PROJECT_KEY_DESKTOP?: string
  readonly VITE_POSTHOG_PROJECT_KEY_POCKET?: string
  readonly VITE_POSTHOG_PROJECT_KEY_DOCS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
