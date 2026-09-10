/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISTRIBUTION?: 'direct' | 'steam'
  readonly VITE_DISABLE_FLUX_PURCHASE?: string
  readonly VITE_DISABLE_CUSTOM_PROVIDERS?: string
  readonly VITE_ENABLE_ANALYTICS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
