import { Output } from "tinyexec";
import "vite";

//#region src/native.d.ts
type CapacitorPlatform = 'android' | 'ios';
//#endregion
//#region src/index.d.ts
interface RunCapViteOptions {
  cwd?: string;
}
interface PreparedViteLaunch {
  baseConfigFile?: string;
  configLoader?: 'bundle' | 'native' | 'runner';
  projectRoot: string;
  viteArgs: string[];
  wrapperConfigFile: string;
}
declare function prepareCapViteLaunch(viteArgs: string[], cwd?: string): PreparedViteLaunch;
declare function runCapVite(viteArgs: string[], capArgs: string[], options?: RunCapViteOptions): Promise<Output>;
//#endregion
export { type CapacitorPlatform, RunCapViteOptions, prepareCapViteLaunch, runCapVite };
//# sourceMappingURL=index.d.mts.map