import { clearClockInterval, setClockInterval } from "@moeru/std";
import { Mutex } from "es-toolkit/promise";
import { attemptAsync } from "es-toolkit";

//#region src/main/loop.ts
function useLoop(fn, options) {
	const mutex = new Mutex();
	const interval = options?.interval ?? 1e3 / 60;
	let timerId = null;
	let shouldRun = options?.autoStart ?? true;
	const tick = async () => {
		if (!shouldRun || mutex.isLocked) return;
		await mutex.acquire();
		try {
			await fn();
		} finally {
			mutex.release();
		}
	};
	const startTimer = () => {
		if (!shouldRun || timerId !== null) return;
		timerId = setClockInterval(() => {
			tick();
		}, interval);
	};
	const stopTimer = () => {
		if (timerId === null) return;
		clearClockInterval(timerId);
		timerId = null;
	};
	const toggleRunState = (next) => {
		shouldRun = next;
		if (shouldRun) {
			startTimer();
			return;
		}
		stopTimer();
	};
	if (shouldRun) startTimer();
	return {
		start: () => toggleRunState(true),
		resume: () => toggleRunState(true),
		pause: () => toggleRunState(false),
		stop: () => toggleRunState(false)
	};
}

//#endregion
//#region src/main/renderer-loop.ts
const rendererDisposedMessage = "Render frame was disposed before WebFrameMain could be accessed";
function safeClose(window) {
	if (!window) return false;
	if (isRendererUnavailable(window)) return false;
	window.close();
	return true;
}
function isRendererUnavailable(window) {
	return window.isDestroyed() || window?.webContents?.isDestroyed() || window?.webContents?.isCrashed();
}
function shouldStopForRendererError(error) {
	if (!(error instanceof Error) || !error.message) return false;
	return error.message.includes(rendererDisposedMessage);
}
function stopLoopWhenRendererIsGone(window, stop) {
	window.on("closed", stop);
	window.webContents.on("destroyed", stop);
	window.webContents.on("render-process-gone", stop);
}
function ensureRendererIsAvailable(window, stop) {
	if (isRendererUnavailable(window)) {
		stop();
		return false;
	}
	return true;
}
function createRendererLoop(params) {
	const { start, stop } = useLoop(async () => {
		if (!ensureRendererIsAvailable(params.window, stop)) return;
		const [error] = await attemptAsync(async () => {
			await params.run();
		});
		if (!error) return;
		if (shouldStopForRendererError(error)) {
			stop();
			return;
		}
		throw error;
	}, {
		autoStart: params.autoStart ?? false,
		interval: params.interval
	});
	stopLoopWhenRendererIsGone(params.window, stop);
	const startLoop = () => {
		if (!ensureRendererIsAvailable(params.window, stop)) return;
		start();
	};
	return {
		start: startLoop,
		stop
	};
}

//#endregion
export { stopLoopWhenRendererIsGone as a, shouldStopForRendererError as i, isRendererUnavailable as n, useLoop as o, safeClose as r, createRendererLoop as t };