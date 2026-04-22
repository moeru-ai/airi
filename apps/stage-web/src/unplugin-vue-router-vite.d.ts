declare module 'unplugin-vue-router/vite' {
  import type { PluginOption } from 'vite'

  export interface VueRouterPluginOptions {
    [key: string]: unknown
  }

  const VueRouter: (options?: VueRouterPluginOptions) => PluginOption
  export default VueRouter
}
