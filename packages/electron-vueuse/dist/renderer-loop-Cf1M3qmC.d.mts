import { BrowserWindow } from "electron";

//#region src/main/loop.d.ts
interface LoopOptions {
  interval?: number;
  autoStart?: boolean;
}
declare function useLoop(fn: () => Promise<void> | void, options?: LoopOptions): {
  start: () => void;
  resume: () => void;
  pause: () => void;
  stop: () => void;
};
//#endregion
//#region src/main/renderer-loop.d.ts
declare function safeClose(window?: BrowserWindow | null): boolean;
declare function isRendererUnavailable(window: BrowserWindow): boolean;
declare function shouldStopForRendererError(error: unknown): boolean;
declare function stopLoopWhenRendererIsGone(window: BrowserWindow, stop: () => void): void;
declare function createRendererLoop(params: {
  window: BrowserWindow;
  run: () => Promise<void> | void;
  interval?: number;
  autoStart?: boolean;
}): {
  start: () => void;
  stop: () => void;
};
//#endregion
export { stopLoopWhenRendererIsGone as a, shouldStopForRendererError as i, isRendererUnavailable as n, LoopOptions as o, safeClose as r, useLoop as s, createRendererLoop as t };