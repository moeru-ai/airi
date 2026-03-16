import { defineEventa, defineInvokeEventa } from "@moeru/eventa";

//#region src/electron/app.ts
const isMacOS = defineInvokeEventa("eventa:invoke:electron:app:is-macos");
const isWindows = defineInvokeEventa("eventa:invoke:electron:app:is-windows");
const isLinux = defineInvokeEventa("eventa:invoke:electron:app:is-linux");
const quit = defineInvokeEventa("eventa:invoke:electron:app:quit");
const app = {
	isMacOS,
	isWindows,
	isLinux,
	quit
};

//#endregion
//#region src/electron/screen.ts
const cursorScreenPoint = defineEventa("eventa:event:electron:screen:cursor-screen-point");
const startLoopGetCursorScreenPoint = defineInvokeEventa("eventa:event:electron:screen:start-loop-get-cursor-screen-point");
const getAllDisplays = defineInvokeEventa("eventa:invoke:electron:screen:get-all-displays");
const getPrimaryDisplay = defineInvokeEventa("eventa:invoke:electron:screen:get-primary-display");
const getCursorScreenPoint = defineInvokeEventa("eventa:invoke:electron:screen:get-cursor-screen-point");
const dipToScreenPoint = defineInvokeEventa("eventa:invoke:electron:screen:dip-to-screen-point");
const dipToScreenRect = defineInvokeEventa("eventa:invoke:electron:screen:dip-to-screen-rect");
const screenToDipPoint = defineInvokeEventa("eventa:invoke:electron:screen:screen-to-dip-point");
const screenToDipRect = defineInvokeEventa("eventa:invoke:electron:screen:screen-to-dip-rect");
const screen = {
	getAllDisplays,
	getPrimaryDisplay,
	getCursorScreenPoint,
	dipToScreenPoint,
	dipToScreenRect,
	screenToDipPoint,
	screenToDipRect
};

//#endregion
//#region src/electron/system-preferences.ts
const getMediaAccessStatus = defineInvokeEventa("eventa:invoke:electron:system-preferences:get-media-access-status");
const askForMediaAccess = defineInvokeEventa("eventa:invoke:electron:system-preferences:ask-for-media-access");
const systemPreferences = {
	getMediaAccessStatus,
	askForMediaAccess
};

//#endregion
//#region src/electron/window.ts
const bounds = defineEventa("eventa:event:electron:window:bounds");
const startLoopGetBounds = defineInvokeEventa("eventa:event:electron:window:start-loop-get-bounds");
const getBounds = defineInvokeEventa("eventa:invoke:electron:window:get-bounds");
const setBounds = defineInvokeEventa("eventa:invoke:electron:window:set-bounds");
const setIgnoreMouseEvents = defineInvokeEventa("eventa:invoke:electron:window:set-ignore-mouse-events");
const setVibrancy = defineInvokeEventa("eventa:invoke:electron:window:set-vibrancy");
const setBackgroundMaterial = defineInvokeEventa("eventa:invoke:electron:window:set-background-material");
const resize = defineInvokeEventa("eventa:invoke:electron:window:resize");
const close = defineInvokeEventa("eventa:invoke:electron:window:close");
const window = {
	getBounds,
	setBounds,
	setIgnoreMouseEvents,
	setVibrancy,
	setBackgroundMaterial,
	resize,
	close
};

//#endregion
export { cursorScreenPoint as a, app as c, systemPreferences as i, startLoopGetBounds as n, screen as o, window as r, startLoopGetCursorScreenPoint as s, bounds as t };