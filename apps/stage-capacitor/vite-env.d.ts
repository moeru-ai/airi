interface ImportMetaEnv {
  readonly VITE_APP_TARGET_HUGGINGFACE_SPACE: boolean
  readonly VITE_PLATFORM: 'ios' | 'android' | 'web'
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
