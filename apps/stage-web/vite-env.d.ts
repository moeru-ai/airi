interface ImportMetaEnv {
  readonly VITE_APP_TARGET_HUGGINGFACE_SPACE: boolean
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
