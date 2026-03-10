/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTHOG_PROJECT_KEY_WEB?: string
  readonly VITE_POSTHOG_PROJECT_KEY_DESKTOP?: string
  readonly VITE_POSTHOG_PROJECT_KEY_POCKET?: string
  readonly VITE_POSTHOG_PROJECT_KEY_DOCS?: string
  readonly VITE_VAD_MODEL_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
