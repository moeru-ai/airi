import * as _moeru_eventa0 from "@moeru/eventa";
import { BrowserWindow } from "electron";

//#region src/electron/window.d.ts
declare const bounds: _moeru_eventa0.Eventa<Electron.Rectangle>;
declare const startLoopGetBounds: {
  sendEvent: _moeru_eventa0.SendEvent<unknown, undefined, Error, Error>;
  sendEventError: _moeru_eventa0.SendEventError<unknown, undefined, Error, Error>;
  sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<unknown, undefined, Error, Error>;
  sendEventAbort: _moeru_eventa0.SendEventAbort<unknown, undefined, Error, Error>;
  receiveEvent: _moeru_eventa0.ReceiveEvent<unknown, undefined, Error, Error>;
  receiveEventError: _moeru_eventa0.ReceiveEventError<unknown, undefined, Error, Error>;
  receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<unknown, undefined, Error, Error>;
};
type VibrancyType = Parameters<BrowserWindow['setVibrancy']>[0];
type BackgroundMaterialType = Parameters<BrowserWindow['setBackgroundMaterial']>[0];
type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
//#endregion
//#region src/electron/screen.d.ts
declare const cursorScreenPoint: _moeru_eventa0.Eventa<Electron.Point>;
declare const startLoopGetCursorScreenPoint: {
  sendEvent: _moeru_eventa0.SendEvent<unknown, undefined, Error, Error>;
  sendEventError: _moeru_eventa0.SendEventError<unknown, undefined, Error, Error>;
  sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<unknown, undefined, Error, Error>;
  sendEventAbort: _moeru_eventa0.SendEventAbort<unknown, undefined, Error, Error>;
  receiveEvent: _moeru_eventa0.ReceiveEvent<unknown, undefined, Error, Error>;
  receiveEventError: _moeru_eventa0.ReceiveEventError<unknown, undefined, Error, Error>;
  receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<unknown, undefined, Error, Error>;
};
//#endregion
export { VibrancyType as a, ResizeDirection as i, startLoopGetCursorScreenPoint as n, bounds as o, BackgroundMaterialType as r, startLoopGetBounds as s, cursorScreenPoint as t };