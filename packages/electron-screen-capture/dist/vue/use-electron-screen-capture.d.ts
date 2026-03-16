import { ScreenCaptureSetSourceRequest, SerializableDesktopCapturerSource } from "../index.js";
import { IpcRenderer } from "../node_modules/.pnpm/@electron-toolkit_preload@3.0.2_electron@39.7.0/node_modules/@electron-toolkit/preload/dist/index.js";
import { MaybeRefOrGetter } from "vue";
import { SourcesOptions } from "electron";

//#region src/vue/use-electron-screen-capture.d.ts
declare function useElectronScreenCapture(ipcRenderer: IpcRenderer, sourcesOptions: MaybeRefOrGetter<SourcesOptions>): {
  getSources: () => Promise<SerializableDesktopCapturerSource[]>;
  setSource: (req: ScreenCaptureSetSourceRequest, options?: {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  }) => Promise<string>;
  resetSource: (req: string, options?: {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  }) => Promise<void>;
  selectWithSource: <R>(selectFn: (sources: SerializableDesktopCapturerSource[]) => string, useFn: () => Promise<R>, request?: Omit<ScreenCaptureSetSourceRequest, "options" | "sourceId">) => Promise<R>;
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
export { useElectronScreenCapture };