import { Plugin } from "vite";

//#region src/vite-plugin.d.ts
interface CapVitePluginOptions {
  capArgs: string[];
}
declare function capVitePlugin(options: CapVitePluginOptions): Plugin;
//#endregion
export { CapVitePluginOptions, capVitePlugin };
//# sourceMappingURL=vite-plugin.d.mts.map