interface ImportMetaEnv {
  readonly VITE_APP_TARGET_HUGGINGFACE_SPACE: boolean
  // more env variables...
  readonly VITE_FEATURE_CORE_PIPELINE?: string // experimental for core package pipeline
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
