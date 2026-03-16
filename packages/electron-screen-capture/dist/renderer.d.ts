import { createContext } from "./node_modules/.pnpm/@moeru_eventa@1.0.0-alpha.14_electron@39.7.0/node_modules/@moeru/eventa/dist/adapters/electron/renderer.js";
import { ScreenCaptureSetSourceRequest, SerializableDesktopCapturerSource } from "./index.js";
import { SourcesOptions } from "electron";

//#region src/renderer.d.ts
interface SourceOptionsWithRequest {
  sourcesOptions?: SourcesOptions;
  request?: Omit<ScreenCaptureSetSourceRequest, 'options' | 'sourceId'>;
}
declare function setupElectronScreenCapture(context: ReturnType<typeof createContext>['context']): {
  getSources: (sourcesOptions: SourcesOptions) => Promise<SerializableDesktopCapturerSource[]>;
  setSource: (req: ScreenCaptureSetSourceRequest, options?: {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  }) => Promise<string>;
  selectWithSource: <R>(selectFn: (sources: SerializableDesktopCapturerSource[]) => string | Promise<string>, useFn: () => R | Promise<R>, options?: SourceOptionsWithRequest) => Promise<R>;
  resetSource: (req: string, options?: {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  }) => Promise<void>;
  checkMacOSPermission: (req?: never, options?: {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  }) => Promise<"not-determined" | "granted" | "denied" | "restricted" | "unknown">;
  requestMacOSPermission: (req?: never, options?: {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  }) => Promise<void>;
};
//#endregion
export { SourceOptionsWithRequest, setupElectronScreenCapture };