import { a as VibrancyType, i as ResizeDirection, n as startLoopGetCursorScreenPoint, o as bounds, r as BackgroundMaterialType, s as startLoopGetBounds, t as cursorScreenPoint } from "../screen-C2k7719e.mjs";
import * as _moeru_eventa0 from "@moeru/eventa";

//#region src/electron/index.d.ts
declare const electron: {
  screen: {
    getAllDisplays: {
      sendEvent: _moeru_eventa0.SendEvent<Electron.Display[], undefined, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<Electron.Display[], undefined, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<Electron.Display[], undefined, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<Electron.Display[], undefined, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<Electron.Display[], undefined, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<Electron.Display[], undefined, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<Electron.Display[], undefined, Error, Error>;
    };
    getPrimaryDisplay: {
      sendEvent: _moeru_eventa0.SendEvent<Electron.Display, undefined, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<Electron.Display, undefined, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<Electron.Display, undefined, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<Electron.Display, undefined, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<Electron.Display, undefined, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<Electron.Display, undefined, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<Electron.Display, undefined, Error, Error>;
    };
    getCursorScreenPoint: {
      sendEvent: _moeru_eventa0.SendEvent<Electron.Point, undefined, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<Electron.Point, undefined, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<Electron.Point, undefined, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<Electron.Point, undefined, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<Electron.Point, undefined, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<Electron.Point, undefined, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<Electron.Point, undefined, Error, Error>;
    };
    dipToScreenPoint: {
      sendEvent: _moeru_eventa0.SendEvent<Electron.Point, Electron.Point, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<Electron.Point, Electron.Point, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<Electron.Point, Electron.Point, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<Electron.Point, Electron.Point, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<Electron.Point, Electron.Point, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<Electron.Point, Electron.Point, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<Electron.Point, Electron.Point, Error, Error>;
    };
    dipToScreenRect: {
      sendEvent: _moeru_eventa0.SendEvent<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<Electron.Rectangle, Electron.Rectangle, Error, Error>;
    };
    screenToDipPoint: {
      sendEvent: _moeru_eventa0.SendEvent<Electron.Point, Electron.Point, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<Electron.Point, Electron.Point, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<Electron.Point, Electron.Point, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<Electron.Point, Electron.Point, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<Electron.Point, Electron.Point, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<Electron.Point, Electron.Point, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<Electron.Point, Electron.Point, Error, Error>;
    };
    screenToDipRect: {
      sendEvent: _moeru_eventa0.SendEvent<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<Electron.Rectangle, Electron.Rectangle, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<Electron.Rectangle, Electron.Rectangle, Error, Error>;
    };
  };
  window: {
    getBounds: {
      sendEvent: _moeru_eventa0.SendEvent<Electron.Rectangle, undefined, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<Electron.Rectangle, undefined, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<Electron.Rectangle, undefined, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<Electron.Rectangle, undefined, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<Electron.Rectangle, undefined, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<Electron.Rectangle, undefined, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<Electron.Rectangle, undefined, Error, Error>;
    };
    setBounds: {
      sendEvent: _moeru_eventa0.SendEvent<void, [bounds: Partial<Electron.Rectangle>, animate?: boolean], Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<void, [bounds: Partial<Electron.Rectangle>, animate?: boolean], Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<void, [bounds: Partial<Electron.Rectangle>, animate?: boolean], Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<void, [bounds: Partial<Electron.Rectangle>, animate?: boolean], Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<void, [bounds: Partial<Electron.Rectangle>, animate?: boolean], Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<void, [bounds: Partial<Electron.Rectangle>, animate?: boolean], Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<void, [bounds: Partial<Electron.Rectangle>, animate?: boolean], Error, Error>;
    };
    setIgnoreMouseEvents: {
      sendEvent: _moeru_eventa0.SendEvent<void, [boolean, {
        forward: boolean;
      }], Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<void, [boolean, {
        forward: boolean;
      }], Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<void, [boolean, {
        forward: boolean;
      }], Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<void, [boolean, {
        forward: boolean;
      }], Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<void, [boolean, {
        forward: boolean;
      }], Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<void, [boolean, {
        forward: boolean;
      }], Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<void, [boolean, {
        forward: boolean;
      }], Error, Error>;
    };
    setVibrancy: {
      sendEvent: _moeru_eventa0.SendEvent<void, [type: "titlebar" | "selection" | "menu" | "popover" | "sidebar" | "header" | "sheet" | "window" | "hud" | "fullscreen-ui" | "tooltip" | "content" | "under-window" | "under-page", options?: Electron.VibrancyOptions] | [null], Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<void, [type: "titlebar" | "selection" | "menu" | "popover" | "sidebar" | "header" | "sheet" | "window" | "hud" | "fullscreen-ui" | "tooltip" | "content" | "under-window" | "under-page", options?: Electron.VibrancyOptions] | [null], Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<void, [type: "titlebar" | "selection" | "menu" | "popover" | "sidebar" | "header" | "sheet" | "window" | "hud" | "fullscreen-ui" | "tooltip" | "content" | "under-window" | "under-page", options?: Electron.VibrancyOptions] | [null], Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<void, [type: "titlebar" | "selection" | "menu" | "popover" | "sidebar" | "header" | "sheet" | "window" | "hud" | "fullscreen-ui" | "tooltip" | "content" | "under-window" | "under-page", options?: Electron.VibrancyOptions] | [null], Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<void, [type: "titlebar" | "selection" | "menu" | "popover" | "sidebar" | "header" | "sheet" | "window" | "hud" | "fullscreen-ui" | "tooltip" | "content" | "under-window" | "under-page", options?: Electron.VibrancyOptions] | [null], Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<void, [type: "titlebar" | "selection" | "menu" | "popover" | "sidebar" | "header" | "sheet" | "window" | "hud" | "fullscreen-ui" | "tooltip" | "content" | "under-window" | "under-page", options?: Electron.VibrancyOptions] | [null], Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<void, [type: "titlebar" | "selection" | "menu" | "popover" | "sidebar" | "header" | "sheet" | "window" | "hud" | "fullscreen-ui" | "tooltip" | "content" | "under-window" | "under-page", options?: Electron.VibrancyOptions] | [null], Error, Error>;
    };
    setBackgroundMaterial: {
      sendEvent: _moeru_eventa0.SendEvent<void, [material: "auto" | "none" | "mica" | "acrylic" | "tabbed"], Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<void, [material: "auto" | "none" | "mica" | "acrylic" | "tabbed"], Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<void, [material: "auto" | "none" | "mica" | "acrylic" | "tabbed"], Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<void, [material: "auto" | "none" | "mica" | "acrylic" | "tabbed"], Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<void, [material: "auto" | "none" | "mica" | "acrylic" | "tabbed"], Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<void, [material: "auto" | "none" | "mica" | "acrylic" | "tabbed"], Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<void, [material: "auto" | "none" | "mica" | "acrylic" | "tabbed"], Error, Error>;
    };
    resize: {
      sendEvent: _moeru_eventa0.SendEvent<void, {
        deltaX: number;
        deltaY: number;
        direction: ResizeDirection;
      }, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<void, {
        deltaX: number;
        deltaY: number;
        direction: ResizeDirection;
      }, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<void, {
        deltaX: number;
        deltaY: number;
        direction: ResizeDirection;
      }, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<void, {
        deltaX: number;
        deltaY: number;
        direction: ResizeDirection;
      }, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<void, {
        deltaX: number;
        deltaY: number;
        direction: ResizeDirection;
      }, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<void, {
        deltaX: number;
        deltaY: number;
        direction: ResizeDirection;
      }, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<void, {
        deltaX: number;
        deltaY: number;
        direction: ResizeDirection;
      }, Error, Error>;
    };
    close: {
      sendEvent: _moeru_eventa0.SendEvent<void, undefined, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<void, undefined, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<void, undefined, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<void, undefined, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<void, undefined, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<void, undefined, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<void, undefined, Error, Error>;
    };
  };
  systemPreferences: {
    getMediaAccessStatus: {
      sendEvent: _moeru_eventa0.SendEvent<"not-determined" | "granted" | "denied" | "restricted" | "unknown", ["microphone" | "camera" | "screen"], Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<"not-determined" | "granted" | "denied" | "restricted" | "unknown", ["microphone" | "camera" | "screen"], Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<"not-determined" | "granted" | "denied" | "restricted" | "unknown", ["microphone" | "camera" | "screen"], Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<"not-determined" | "granted" | "denied" | "restricted" | "unknown", ["microphone" | "camera" | "screen"], Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<"not-determined" | "granted" | "denied" | "restricted" | "unknown", ["microphone" | "camera" | "screen"], Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<"not-determined" | "granted" | "denied" | "restricted" | "unknown", ["microphone" | "camera" | "screen"], Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<"not-determined" | "granted" | "denied" | "restricted" | "unknown", ["microphone" | "camera" | "screen"], Error, Error>;
    };
    askForMediaAccess: {
      sendEvent: _moeru_eventa0.SendEvent<Promise<boolean>, ["microphone" | "camera"], Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<Promise<boolean>, ["microphone" | "camera"], Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<Promise<boolean>, ["microphone" | "camera"], Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<Promise<boolean>, ["microphone" | "camera"], Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<Promise<boolean>, ["microphone" | "camera"], Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<Promise<boolean>, ["microphone" | "camera"], Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<Promise<boolean>, ["microphone" | "camera"], Error, Error>;
    };
  };
  app: {
    isMacOS: {
      sendEvent: _moeru_eventa0.SendEvent<boolean, undefined, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<boolean, undefined, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<boolean, undefined, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<boolean, undefined, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<boolean, undefined, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<boolean, undefined, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<boolean, undefined, Error, Error>;
    };
    isWindows: {
      sendEvent: _moeru_eventa0.SendEvent<boolean, undefined, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<boolean, undefined, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<boolean, undefined, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<boolean, undefined, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<boolean, undefined, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<boolean, undefined, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<boolean, undefined, Error, Error>;
    };
    isLinux: {
      sendEvent: _moeru_eventa0.SendEvent<boolean, undefined, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<boolean, undefined, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<boolean, undefined, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<boolean, undefined, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<boolean, undefined, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<boolean, undefined, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<boolean, undefined, Error, Error>;
    };
    quit: {
      sendEvent: _moeru_eventa0.SendEvent<void, undefined, Error, Error>;
      sendEventError: _moeru_eventa0.SendEventError<void, undefined, Error, Error>;
      sendEventStreamEnd: _moeru_eventa0.SendEventStreamEnd<void, undefined, Error, Error>;
      sendEventAbort: _moeru_eventa0.SendEventAbort<void, undefined, Error, Error>;
      receiveEvent: _moeru_eventa0.ReceiveEvent<void, undefined, Error, Error>;
      receiveEventError: _moeru_eventa0.ReceiveEventError<void, undefined, Error, Error>;
      receiveEventStreamEnd: _moeru_eventa0.ReceiveEventStreamEnd<void, undefined, Error, Error>;
    };
  };
};
//#endregion
export { type BackgroundMaterialType, type ResizeDirection, type VibrancyType, bounds, cursorScreenPoint, electron, startLoopGetBounds, startLoopGetCursorScreenPoint };