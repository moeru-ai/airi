/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISTRIBUTION?: 'direct' | 'steam'
  readonly VITE_DISABLE_FLUX_PURCHASE?: string
  readonly VITE_DISABLE_CUSTOM_PROVIDERS?: string
  readonly VITE_ENABLE_ANALYTICS?: string
  readonly VITE_REVENUECAT_WEB_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
