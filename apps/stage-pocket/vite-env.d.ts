/// <reference types="vite/client" />
/// <reference types="../../vite-env.d.ts" />

interface ImportMetaEnv {
  readonly VITE_APP_TARGET_HUGGINGFACE_SPACE: string
  readonly VITE_PLATFORM: 'ios' | 'android' | 'web'
  // more env variables...
}
