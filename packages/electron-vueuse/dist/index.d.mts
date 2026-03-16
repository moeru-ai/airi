import { a as stopLoopWhenRendererIsGone, i as shouldStopForRendererError, n as isRendererUnavailable, o as LoopOptions, s as useLoop, t as createRendererLoop } from "./renderer-loop-Cf1M3qmC.mjs";
import * as _moeru_eventa0 from "@moeru/eventa";
import { InvokeEventa } from "@moeru/eventa";
import * as _vueuse_core0 from "@vueuse/core";
import { MaybeElementRef, MouseInElementOptions, UseMouseOptions } from "@vueuse/core";
import { createContext } from "@moeru/eventa/adapters/electron/renderer";
import * as vue from "vue";
import { BrowserWindow } from "electron";

//#region src/composables/use-electron-all-displays.d.ts
declare function useElectronAllDisplays(): vue.Ref<Electron.Display[], Electron.Display[]>;
//#endregion
//#region ../../node_modules/.pnpm/builder-util-runtime@9.5.1/node_modules/builder-util-runtime/out/updateInfo.d.ts
interface ReleaseNoteInfo {
  /**
   * The version.
   */
  readonly version: string;
  /**
   * The note.
   */
  readonly note: string | null;
}
interface BlockMapDataHolder {
  /**
   * The file size. Used to verify downloaded size (save one HTTP request to get length).
   * Also used when block map data is embedded into the file (appimage, windows web installer package).
   */
  size?: number;
  /**
   * The block map file size. Used when block map data is embedded into the file (appimage, windows web installer package).
   * This information can be obtained from the file itself, but it requires additional HTTP request,
   * so, to reduce request count, block map size is specified in the update metadata too.
   */
  blockMapSize?: number;
  /**
   * The file checksum.
   */
  readonly sha512: string;
  readonly isAdminRightsRequired?: boolean;
}
interface UpdateFileInfo extends BlockMapDataHolder {
  url: string;
}
interface UpdateInfo {
  /**
   * The version.
   */
  readonly version: string;
  readonly files: Array<UpdateFileInfo>;
  /** @deprecated */
  readonly path: string;
  /** @deprecated */
  readonly sha512: string;
  /**
   * The release name.
   */
  releaseName?: string | null;
  /**
   * The release notes. List if `updater.fullChangelog` is set to `true`, `string` otherwise.
   */
  releaseNotes?: string | Array<ReleaseNoteInfo> | null;
  /**
   * The release date.
   */
  releaseDate: string;
  /**
   * The [staged rollout](./auto-update.md#staged-rollouts) percentage, 0-100.
   */
  readonly stagingPercentage?: number;
  /**
   * The minimum version of system required for the app to run. Sample value: macOS `23.1.0`, Windows `10.0.22631`.
   * Same with os.release() value, this is a kernel version.
   */
  readonly minimumSystemVersion?: string;
}
//#endregion
//#region ../electron-eventa/dist/electron-updater/index.d.mts
//#region src/electron-updater/index.d.ts
type AutoUpdaterStatus = 'idle' | 'disabled' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
interface AutoUpdaterProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}
interface AutoUpdaterError {
  message: string;
}
interface AutoUpdaterState {
  status: AutoUpdaterStatus;
  info?: Omit<UpdateInfo, 'path' | 'sha512'>;
  progress?: AutoUpdaterProgress;
  error?: AutoUpdaterError;
}
//#endregion
//#region src/composables/use-electron-auto-updater.d.ts
declare function useElectronAutoUpdater(): {
  state: vue.Ref<{
    status: AutoUpdaterStatus;
    info?: {
      readonly version: string;
      readonly files: {
        url: string;
        size?: number;
        blockMapSize?: number;
        readonly sha512: string;
        readonly isAdminRightsRequired?: boolean;
      }[];
      releaseName?: string | null;
      releaseNotes?: string | {
        readonly version: string;
        readonly note: string | null;
      }[];
      releaseDate: string;
      readonly stagingPercentage?: number;
      readonly minimumSystemVersion?: string;
    };
    progress?: {
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    };
    error?: {
      message: string;
    };
  }, AutoUpdaterState | {
    status: AutoUpdaterStatus;
    info?: {
      readonly version: string;
      readonly files: {
        url: string;
        size?: number;
        blockMapSize?: number;
        readonly sha512: string;
        readonly isAdminRightsRequired?: boolean;
      }[];
      releaseName?: string | null;
      releaseNotes?: string | {
        readonly version: string;
        readonly note: string | null;
      }[];
      releaseDate: string;
      readonly stagingPercentage?: number;
      readonly minimumSystemVersion?: string;
    };
    progress?: {
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    };
    error?: {
      message: string;
    };
  }>;
  isBusy: vue.ComputedRef<boolean>;
  canDownload: vue.ComputedRef<boolean>;
  canRestartToUpdate: vue.ComputedRef<boolean>;
  checkForUpdates: (req?: undefined, options?: {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  }) => Promise<AutoUpdaterState>;
  downloadUpdate: (req?: undefined, options?: {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  }) => Promise<AutoUpdaterState>;
  quitAndInstall: (req?: undefined, options?: {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  } | {
    signal?: AbortSignal;
  }) => Promise<void>;
};
//#endregion
//#region src/composables/use-electron-eventa-context.d.ts
type EventaContext = ReturnType<typeof createContext>['context'];
type IpcRendererLike = Parameters<typeof createContext>[0];
declare function getElectronEventaContext(ipcRenderer?: IpcRendererLike): EventaContext;
declare function useElectronEventaContext(ipcRenderer?: IpcRendererLike): vue.Ref<{
  listeners: Map<_moeru_eventa0.EventTag<any, any>, Set<(params: any) => any> & Omit<Set<(params: any) => any>, keyof Set<any>>> & Omit<Map<_moeru_eventa0.EventTag<any, any>, Set<(params: any) => any>>, keyof Map<any, any>>;
  onceListeners: Map<_moeru_eventa0.EventTag<any, any>, Set<(params: any) => any> & Omit<Set<(params: any) => any>, keyof Set<any>>> & Omit<Map<_moeru_eventa0.EventTag<any, any>, Set<(params: any) => any>>, keyof Map<any, any>>;
  emit: <P>(event: _moeru_eventa0.Eventa<P>, payload: P, options?: {
    raw: {
      ipcRendererEvent: Electron.IpcRendererEvent;
      event: Event | unknown;
    };
  }) => void;
  on: <P>(eventOrMatchExpression: _moeru_eventa0.Eventa<P> | _moeru_eventa0.EventaMatchExpression<P>, handler: (payload: _moeru_eventa0.Eventa<P>, options?: {
    raw: {
      ipcRendererEvent: Electron.IpcRendererEvent;
      event: Event | unknown;
    };
  }) => void) => () => void;
  once: <P>(eventOrMatchExpression: _moeru_eventa0.Eventa<P> | _moeru_eventa0.EventaMatchExpression<P>, handler: (payload: _moeru_eventa0.Eventa<P>, options?: {
    raw: {
      ipcRendererEvent: Electron.IpcRendererEvent;
      event: Event | unknown;
    };
  }) => void) => () => void;
  off: <P>(eventOrMatchExpression: _moeru_eventa0.Eventa<P> | _moeru_eventa0.EventaMatchExpression<P>, handler?: (payload: _moeru_eventa0.Eventa<P>, options?: {
    raw: {
      ipcRendererEvent: Electron.IpcRendererEvent;
      event: Event | unknown;
    };
  }) => void) => void;
  extensions?: any;
}, _moeru_eventa0.EventContext<any, {
  raw: {
    ipcRendererEvent: Electron.IpcRendererEvent;
    event: Event | unknown;
  };
}> | {
  listeners: Map<_moeru_eventa0.EventTag<any, any>, Set<(params: any) => any> & Omit<Set<(params: any) => any>, keyof Set<any>>> & Omit<Map<_moeru_eventa0.EventTag<any, any>, Set<(params: any) => any>>, keyof Map<any, any>>;
  onceListeners: Map<_moeru_eventa0.EventTag<any, any>, Set<(params: any) => any> & Omit<Set<(params: any) => any>, keyof Set<any>>> & Omit<Map<_moeru_eventa0.EventTag<any, any>, Set<(params: any) => any>>, keyof Map<any, any>>;
  emit: <P>(event: _moeru_eventa0.Eventa<P>, payload: P, options?: {
    raw: {
      ipcRendererEvent: Electron.IpcRendererEvent;
      event: Event | unknown;
    };
  }) => void;
  on: <P>(eventOrMatchExpression: _moeru_eventa0.Eventa<P> | _moeru_eventa0.EventaMatchExpression<P>, handler: (payload: _moeru_eventa0.Eventa<P>, options?: {
    raw: {
      ipcRendererEvent: Electron.IpcRendererEvent;
      event: Event | unknown;
    };
  }) => void) => () => void;
  once: <P>(eventOrMatchExpression: _moeru_eventa0.Eventa<P> | _moeru_eventa0.EventaMatchExpression<P>, handler: (payload: _moeru_eventa0.Eventa<P>, options?: {
    raw: {
      ipcRendererEvent: Electron.IpcRendererEvent;
      event: Event | unknown;
    };
  }) => void) => () => void;
  off: <P>(eventOrMatchExpression: _moeru_eventa0.Eventa<P> | _moeru_eventa0.EventaMatchExpression<P>, handler?: (payload: _moeru_eventa0.Eventa<P>, options?: {
    raw: {
      ipcRendererEvent: Electron.IpcRendererEvent;
      event: Event | unknown;
    };
  }) => void) => void;
  extensions?: any;
}>;
declare function useElectronEventaInvoke<Res, Req = undefined, ResErr = Error, ReqErr = Error>(invoke: InvokeEventa<Res, Req, ResErr, ReqErr>, context?: EventaContext): _moeru_eventa0.InvokeFunction<Res, Req, _moeru_eventa0.EventContext<any, {
  raw: {
    ipcRendererEvent: Electron.IpcRendererEvent;
    event: Event | unknown;
  };
}>>;
declare function resetElectronEventaContextForTesting(): void;
//#endregion
//#region src/composables/use-electron-mouse.d.ts
declare function useElectronMouseEventTarget(): vue.Ref<{
  addEventListener: (type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) => void;
  dispatchEvent: (event: Event) => boolean;
  removeEventListener: (type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) => void;
}, EventTarget | {
  addEventListener: (type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) => void;
  dispatchEvent: (event: Event) => boolean;
  removeEventListener: (type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) => void;
}>;
declare function useElectronMouse(options?: UseMouseOptions): {
  x: vue.ShallowRef<number, number>;
  y: vue.ShallowRef<number, number>;
  sourceType: vue.ShallowRef<_vueuse_core0.UseMouseSourceType, _vueuse_core0.UseMouseSourceType>;
};
//#endregion
//#region src/composables/use-electron-mouse-around-window-border.d.ts
interface UseElectronMouseAroundWindowBorderOptions {
  /** Pixel distance from the window edge to consider as "near". */
  threshold?: number;
  /** Allow a small overshoot outside the window and still count as near. Defaults to threshold. */
  overshoot?: number;
}
/**
 * Detect when the cursor is near the window border using window-relative mouse coords.
 * Fast path: no extra listeners; reuses existing mouse and window bounds streams.
 */
declare function useElectronMouseAroundWindowBorder(options?: UseElectronMouseAroundWindowBorderOptions): {
  x: vue.ComputedRef<number>;
  y: vue.ComputedRef<number>;
  width: vue.Ref<number, number>;
  height: vue.Ref<number, number>;
  nearLeft: vue.ComputedRef<boolean>;
  nearRight: vue.ComputedRef<boolean>;
  nearTop: vue.ComputedRef<boolean>;
  nearBottom: vue.ComputedRef<boolean>;
  nearTopLeft: vue.ComputedRef<boolean>;
  nearTopRight: vue.ComputedRef<boolean>;
  nearBottomLeft: vue.ComputedRef<boolean>;
  nearBottomRight: vue.ComputedRef<boolean>;
  isNearAnyBorder: vue.ComputedRef<boolean>;
};
//#endregion
//#region src/composables/use-electron-mouse-in-element.d.ts
/**
 * Reactive mouse position related to an element.
 *
 * @see https://vueuse.org/useMouseInElement
 * @param target
 * @param options
 */
declare function useElectronMouseInElement(target?: MaybeElementRef, options?: MouseInElementOptions): {
  x: vue.ComputedRef<number>;
  y: vue.ComputedRef<number>;
  sourceType: vue.ShallowRef<_vueuse_core0.UseMouseSourceType, _vueuse_core0.UseMouseSourceType>;
  elementX: vue.ShallowRef<number, number>;
  elementY: vue.ShallowRef<number, number>;
  elementPositionX: vue.ShallowRef<number, number>;
  elementPositionY: vue.ShallowRef<number, number>;
  elementHeight: vue.ShallowRef<number, number>;
  elementWidth: vue.ShallowRef<number, number>;
  isOutside: vue.ShallowRef<boolean, boolean>;
  stop: () => void;
};
type UseMouseInElementReturn = ReturnType<typeof useElectronMouseInElement>;
//#endregion
//#region src/composables/use-electron-mouse-in-window.d.ts
declare function useElectronMouseInWindow(options?: MouseInElementOptions): {
  x: vue.ComputedRef<number>;
  y: vue.ComputedRef<number>;
  sourceType: vue.ShallowRef<_vueuse_core0.UseMouseSourceType, _vueuse_core0.UseMouseSourceType>;
  elementX: vue.ShallowRef<number, number>;
  elementY: vue.ShallowRef<number, number>;
  elementPositionX: vue.ShallowRef<number, number>;
  elementPositionY: vue.ShallowRef<number, number>;
  elementHeight: vue.ShallowRef<number, number>;
  elementWidth: vue.ShallowRef<number, number>;
  isOutside: vue.ShallowRef<boolean, boolean>;
  stop: () => void;
};
//#endregion
//#region src/composables/use-electron-relative-mouse.d.ts
declare function useElectronRelativeMouse(options?: UseMouseOptions): {
  x: vue.ComputedRef<number>;
  y: vue.ComputedRef<number>;
  sourceType: vue.ShallowRef<_vueuse_core0.UseMouseSourceType, _vueuse_core0.UseMouseSourceType>;
};
//#endregion
//#region src/composables/use-electron-window-bounds.d.ts
declare function useElectronWindowBounds(): {
  x: vue.Ref<number, number>;
  y: vue.Ref<number, number>;
  width: vue.Ref<number, number>;
  height: vue.Ref<number, number>;
};
//#endregion
//#region ../electron-eventa/dist/screen-C2k7719e.d.mts
type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'; //#endregion
//#region src/electron/screen.d.ts
//#endregion
//#region src/composables/use-electron-window-resize.d.ts
declare function useElectronWindowResize(): {
  handleResizeStart: (e: MouseEvent, direction: ResizeDirection) => Promise<void>;
};
//#endregion
export { type LoopOptions, type UseMouseInElementReturn, createRendererLoop, getElectronEventaContext, isRendererUnavailable, resetElectronEventaContextForTesting, shouldStopForRendererError, stopLoopWhenRendererIsGone, useElectronAllDisplays, useElectronAutoUpdater, useElectronEventaContext, useElectronEventaInvoke, useElectronMouse, useElectronMouseAroundWindowBorder, useElectronMouseEventTarget, useElectronMouseInElement, useElectronMouseInWindow, useElectronRelativeMouse, useElectronWindowBounds, useElectronWindowResize, useLoop };