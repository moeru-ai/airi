import { BrowserWindow, DesktopCapturerSource, SourcesOptions } from "electron";

//#region src/main/index.d.ts
declare const defaultSourcesOptions: SourcesOptions;
declare const featureSwitchKey: "enable-features";
declare enum LoopbackAudioTypes {
  Loopback = "loopback",
  LoopbackWithMute = "loopbackWithMute"
}
declare function buildFeatureFlags({
  otherEnabledFeatures,
  forceCoreAudioTap
}: {
  otherEnabledFeatures?: string[];
  forceCoreAudioTap?: boolean;
}): string;
interface InitMainOptions {
  forceCoreAudioTap?: boolean;
  mutexAcquireTimeout?: number;
  loggerOptions?: {
    logLevel?: string;
    format?: 'json' | 'plain';
  };
}
interface InitWindowOptions {
  loopbackWithMute?: boolean;
  sourcesOptions?: SourcesOptions;
  onAfterGetSources?: (sources: DesktopCapturerSource[]) => DesktopCapturerSource[];
  loggerOptions?: {
    logLevel?: string;
    format?: 'json' | 'plain';
  };
}
interface GetLoopbackAudioMediaStreamOptions {
  removeVideo?: boolean;
}
declare function initScreenCaptureForMain(options?: InitMainOptions): void;
declare function initScreenCaptureForWindow(window: BrowserWindow, options?: InitWindowOptions): void;
//#endregion
export { GetLoopbackAudioMediaStreamOptions, InitMainOptions, InitWindowOptions, LoopbackAudioTypes, buildFeatureFlags, defaultSourcesOptions, featureSwitchKey, initScreenCaptureForMain, initScreenCaptureForWindow };