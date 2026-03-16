import { a as stopLoopWhenRendererIsGone, i as shouldStopForRendererError, n as isRendererUnavailable, o as useLoop, t as createRendererLoop } from "./renderer-loop-qSjPuJmZ.mjs";
import "./main/index.mjs";
import { defineEventa, defineInvoke, defineInvokeEventa } from "@moeru/eventa";
import { defaultWindow, tryOnMounted, unrefElement, useAsyncState, useEventListener, useIntervalFn, useMouse, useMutationObserver, useResizeObserver } from "@vueuse/core";
import { createContext } from "@moeru/eventa/adapters/electron/renderer";
import { computed, onMounted, ref, shallowRef, watch } from "vue";

//#region ../electron-eventa/dist/window-DKWTnfRw.mjs
const app = {
	isMacOS: defineInvokeEventa("eventa:invoke:electron:app:is-macos"),
	isWindows: defineInvokeEventa("eventa:invoke:electron:app:is-windows"),
	isLinux: defineInvokeEventa("eventa:invoke:electron:app:is-linux"),
	quit: defineInvokeEventa("eventa:invoke:electron:app:quit")
};
const cursorScreenPoint = defineEventa("eventa:event:electron:screen:cursor-screen-point");
const startLoopGetCursorScreenPoint = defineInvokeEventa("eventa:event:electron:screen:start-loop-get-cursor-screen-point");
const screen = {
	getAllDisplays: defineInvokeEventa("eventa:invoke:electron:screen:get-all-displays"),
	getPrimaryDisplay: defineInvokeEventa("eventa:invoke:electron:screen:get-primary-display"),
	getCursorScreenPoint: defineInvokeEventa("eventa:invoke:electron:screen:get-cursor-screen-point"),
	dipToScreenPoint: defineInvokeEventa("eventa:invoke:electron:screen:dip-to-screen-point"),
	dipToScreenRect: defineInvokeEventa("eventa:invoke:electron:screen:dip-to-screen-rect"),
	screenToDipPoint: defineInvokeEventa("eventa:invoke:electron:screen:screen-to-dip-point"),
	screenToDipRect: defineInvokeEventa("eventa:invoke:electron:screen:screen-to-dip-rect")
};
const systemPreferences = {
	getMediaAccessStatus: defineInvokeEventa("eventa:invoke:electron:system-preferences:get-media-access-status"),
	askForMediaAccess: defineInvokeEventa("eventa:invoke:electron:system-preferences:ask-for-media-access")
};
const bounds = defineEventa("eventa:event:electron:window:bounds");
const startLoopGetBounds = defineInvokeEventa("eventa:event:electron:window:start-loop-get-bounds");
const window = {
	getBounds: defineInvokeEventa("eventa:invoke:electron:window:get-bounds"),
	setBounds: defineInvokeEventa("eventa:invoke:electron:window:set-bounds"),
	setIgnoreMouseEvents: defineInvokeEventa("eventa:invoke:electron:window:set-ignore-mouse-events"),
	setVibrancy: defineInvokeEventa("eventa:invoke:electron:window:set-vibrancy"),
	setBackgroundMaterial: defineInvokeEventa("eventa:invoke:electron:window:set-background-material"),
	resize: defineInvokeEventa("eventa:invoke:electron:window:resize"),
	close: defineInvokeEventa("eventa:invoke:electron:window:close")
};

//#endregion
//#region ../electron-eventa/dist/electron/index.mjs
const electron = {
	screen,
	window,
	systemPreferences,
	app
};

//#endregion
//#region src/composables/use-electron-eventa-context.ts
let sharedContext;
function resolveIpcRenderer(ipcRenderer) {
	if (ipcRenderer) return ipcRenderer;
	const globalIpcRenderer = globalThis.window?.electron?.ipcRenderer;
	if (!globalIpcRenderer) throw new Error("Electron ipcRenderer is not available. Pass it explicitly to useElectronEventaContext().");
	return globalIpcRenderer;
}
function getElectronEventaContext(ipcRenderer) {
	sharedContext ??= createContext(resolveIpcRenderer(ipcRenderer)).context;
	return sharedContext;
}
function useElectronEventaContext(ipcRenderer) {
	return ref(getElectronEventaContext(ipcRenderer));
}
function useElectronEventaInvoke(invoke, context) {
	return defineInvoke(context ?? getElectronEventaContext(), invoke);
}
function resetElectronEventaContextForTesting() {
	sharedContext = void 0;
}

//#endregion
//#region src/composables/use-electron-all-displays.ts
function useElectronAllDisplays() {
	const getAllDisplays = defineInvoke(useElectronEventaContext().value, electron.screen.getAllDisplays);
	const { state: allDisplays, execute } = useAsyncState(() => getAllDisplays(), []);
	useIntervalFn(() => {
		execute();
	}, 5e3);
	return allDisplays;
}

//#endregion
//#region ../electron-eventa/dist/electron-updater/index.mjs
const electronAutoUpdaterStateChanged = defineEventa("eventa:event:electron:auto-updater:state-changed");
const autoUpdater = {
	getState: defineInvokeEventa("eventa:invoke:electron:auto-updater:get-state"),
	checkForUpdates: defineInvokeEventa("eventa:invoke:electron:auto-updater:check-for-updates"),
	downloadUpdate: defineInvokeEventa("eventa:invoke:electron:auto-updater:download-update"),
	quitAndInstall: defineInvokeEventa("eventa:invoke:electron:auto-updater:quit-and-install")
};

//#endregion
//#region src/composables/use-electron-auto-updater.ts
function useElectronAutoUpdater() {
	const context = useElectronEventaContext();
	const state = ref({ status: "idle" });
	const getState = useElectronEventaInvoke(autoUpdater.getState, context.value);
	const checkForUpdates = useElectronEventaInvoke(autoUpdater.checkForUpdates, context.value);
	const downloadUpdate = useElectronEventaInvoke(autoUpdater.downloadUpdate, context.value);
	const quitAndInstall = useElectronEventaInvoke(autoUpdater.quitAndInstall, context.value);
	const isBusy = computed(() => ["checking", "downloading"].includes(state.value.status));
	const canDownload = computed(() => state.value.status === "available");
	const canRestartToUpdate = computed(() => state.value.status === "downloaded");
	onMounted(async () => {
		try {
			const current = await getState();
			if (current) state.value = current;
		} catch {}
		try {
			context.value.on(electronAutoUpdaterStateChanged, (evt) => {
				if (evt.body) state.value = evt.body;
			});
		} catch {}
	});
	return {
		state,
		isBusy,
		canDownload,
		canRestartToUpdate,
		checkForUpdates,
		downloadUpdate,
		quitAndInstall
	};
}

//#endregion
//#region src/composables/use-electron-mouse.ts
let sharedEventTarget;
let startedTracking = false;
function useElectronMouseEventTarget() {
	const context = getElectronEventaContext();
	if (!sharedEventTarget) {
		sharedEventTarget = new EventTarget();
		context.on(cursorScreenPoint, (event) => {
			const e = new MouseEvent("mousemove", {
				screenX: event.body?.x,
				screenY: event.body?.y
			});
			sharedEventTarget?.dispatchEvent(e);
		});
	}
	if (!startedTracking) {
		startedTracking = true;
		defineInvoke(context, startLoopGetCursorScreenPoint)();
	}
	return ref(sharedEventTarget);
}
function useElectronMouse(options) {
	const eventTarget = useElectronMouseEventTarget();
	return useMouse({
		...options,
		target: eventTarget,
		type: "screen"
	});
}

//#endregion
//#region src/composables/use-electron-window-bounds.ts
const windowBoundsX = ref(0);
const windowBoundsY = ref(0);
const windowBoundsWidth = ref(0);
const windowBoundsHeight = ref(0);
let initialized = false;
function initializeWindowBoundsTracking() {
	if (initialized) return;
	initialized = true;
	const context = getElectronEventaContext();
	context.on(bounds, (event) => {
		if (!event || !event.body) return;
		windowBoundsX.value = event.body.x;
		windowBoundsY.value = event.body.y;
		windowBoundsWidth.value = event.body.width;
		windowBoundsHeight.value = event.body.height;
	});
	defineInvoke(context, startLoopGetBounds)();
}
function useElectronWindowBounds() {
	initializeWindowBoundsTracking();
	return {
		x: windowBoundsX,
		y: windowBoundsY,
		width: windowBoundsWidth,
		height: windowBoundsHeight
	};
}

//#endregion
//#region src/composables/use-electron-relative-mouse.ts
function useElectronRelativeMouse(options) {
	const mouse = useElectronMouse(options);
	const { x: windowX, y: windowY } = useElectronWindowBounds();
	const x = computed(() => mouse.x.value - windowX.value);
	const y = computed(() => mouse.y.value - windowY.value);
	return {
		...mouse,
		x,
		y
	};
}

//#endregion
//#region src/composables/use-electron-mouse-around-window-border.ts
/**
* Detect when the cursor is near the window border using window-relative mouse coords.
* Fast path: no extra listeners; reuses existing mouse and window bounds streams.
*/
function useElectronMouseAroundWindowBorder(options = {}) {
	const threshold = options.threshold ?? 8;
	const overshoot = options.overshoot ?? threshold;
	const { x, y } = useElectronRelativeMouse();
	const { width, height } = useElectronWindowBounds();
	const nearLeft = computed(() => Math.abs(x.value) <= threshold && y.value > -overshoot && y.value < height.value + overshoot);
	const nearRight = computed(() => Math.abs(x.value - width.value) <= threshold && y.value > -overshoot && y.value < height.value + overshoot);
	const nearTop = computed(() => Math.abs(y.value) <= threshold && x.value > -overshoot && x.value < width.value + overshoot);
	const nearBottom = computed(() => Math.abs(y.value - height.value) <= threshold && x.value > -overshoot && x.value < width.value + overshoot);
	return {
		x,
		y,
		width,
		height,
		nearLeft,
		nearRight,
		nearTop,
		nearBottom,
		nearTopLeft: computed(() => nearTop.value && nearLeft.value),
		nearTopRight: computed(() => nearTop.value && nearRight.value),
		nearBottomLeft: computed(() => nearBottom.value && nearLeft.value),
		nearBottomRight: computed(() => nearBottom.value && nearRight.value),
		isNearAnyBorder: computed(() => nearLeft.value || nearRight.value || nearTop.value || nearBottom.value)
	};
}

//#endregion
//#region src/composables/use-electron-mouse-in-element.ts
/**
* Reactive mouse position related to an element.
*
* @see https://vueuse.org/useMouseInElement
* @param target
* @param options
*/
function useElectronMouseInElement(target, options = {}) {
	const { windowResize = true, windowScroll = true, handleOutside = true, window = defaultWindow } = options;
	const type = options.type || "page";
	const { x, y, sourceType } = useElectronRelativeMouse(options);
	const targetRef = shallowRef(target ?? window?.document.body);
	const elementX = shallowRef(0);
	const elementY = shallowRef(0);
	const elementPositionX = shallowRef(0);
	const elementPositionY = shallowRef(0);
	const elementHeight = shallowRef(0);
	const elementWidth = shallowRef(0);
	const isOutside = shallowRef(true);
	function update() {
		if (!window) return;
		const el = unrefElement(targetRef);
		if (!el || !(el instanceof Element)) return;
		const { left, top, width, height } = el.getBoundingClientRect();
		elementPositionX.value = left + (type === "page" ? window.pageXOffset : 0);
		elementPositionY.value = top + (type === "page" ? window.pageYOffset : 0);
		elementHeight.value = height;
		elementWidth.value = width;
		const elX = x.value - elementPositionX.value;
		const elY = y.value - elementPositionY.value;
		isOutside.value = width === 0 || height === 0 || elX < 0 || elY < 0 || elX > width || elY > height;
		if (handleOutside || !isOutside.value) {
			elementX.value = elX;
			elementY.value = elY;
		}
	}
	const stopFnList = [];
	function stop() {
		stopFnList.forEach((fn) => fn());
		stopFnList.length = 0;
	}
	tryOnMounted(() => {
		update();
	});
	if (window) {
		const { stop: stopResizeObserver } = useResizeObserver(targetRef, update);
		const { stop: stopMutationObserver } = useMutationObserver(targetRef, update, { attributeFilter: ["style", "class"] });
		const stopWatch = watch([
			targetRef,
			x,
			y
		], update);
		stopFnList.push(stopResizeObserver, stopMutationObserver, stopWatch);
		useEventListener(document, "mouseleave", () => isOutside.value = true, { passive: true });
		if (windowScroll) stopFnList.push(useEventListener("scroll", update, {
			capture: true,
			passive: true
		}));
		if (windowResize) stopFnList.push(useEventListener("resize", update, { passive: true }));
	}
	return {
		x,
		y,
		sourceType,
		elementX,
		elementY,
		elementPositionX,
		elementPositionY,
		elementHeight,
		elementWidth,
		isOutside,
		stop
	};
}

//#endregion
//#region src/composables/use-electron-mouse-in-window.ts
function useElectronMouseInWindow(options = {}) {
	return useElectronMouseInElement(void 0, options);
}

//#endregion
//#region src/composables/use-electron-window-resize.ts
function useElectronWindowResize() {
	const isWindows = useElectronEventaInvoke(electron.app.isWindows);
	const resizeWindow = useElectronEventaInvoke(electron.window.resize);
	const handleResizeStart = async (e, direction) => {
		if (!await isWindows()) return;
		e.preventDefault();
		e.stopPropagation();
		let lastX = e.screenX;
		let lastY = e.screenY;
		const handleMouseMove = (moveEvent) => {
			const deltaX = moveEvent.screenX - lastX;
			const deltaY = moveEvent.screenY - lastY;
			if (deltaX !== 0 || deltaY !== 0) {
				resizeWindow({
					deltaX,
					deltaY,
					direction
				});
				lastX = moveEvent.screenX;
				lastY = moveEvent.screenY;
			}
		};
		const handleMouseUp = () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	};
	return { handleResizeStart };
}

//#endregion
export { createRendererLoop, getElectronEventaContext, isRendererUnavailable, resetElectronEventaContextForTesting, shouldStopForRendererError, stopLoopWhenRendererIsGone, useElectronAllDisplays, useElectronAutoUpdater, useElectronEventaContext, useElectronEventaInvoke, useElectronMouse, useElectronMouseAroundWindowBorder, useElectronMouseEventTarget, useElectronMouseInElement, useElectronMouseInWindow, useElectronRelativeMouse, useElectronWindowBounds, useElectronWindowResize, useLoop };