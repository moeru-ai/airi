import { defineInvoke } from "../node_modules/.pnpm/@moeru_eventa@1.0.0-alpha.14_electron@39.7.0/node_modules/@moeru/eventa/dist/src-OOE3RB9u.js";
import { createContext } from "../node_modules/.pnpm/@moeru_eventa@1.0.0-alpha.14_electron@39.7.0/node_modules/@moeru/eventa/dist/adapters/electron/renderer.js";
import { screenCapture } from "../index.js";
import { toRaw, toValue } from "vue";

//#region src/vue/use-electron-screen-capture.ts
function useElectronScreenCapture(ipcRenderer, sourcesOptions) {
	const context = createContext(ipcRenderer).context;
	const invokeGetSources = defineInvoke(context, screenCapture.getSources);
	const setSource = defineInvoke(context, screenCapture.setSource);
	const resetSource = defineInvoke(context, screenCapture.resetSource);
	const checkMacOSPermission = defineInvoke(context, screenCapture.checkMacOSPermission);
	const requestMacOSPermission = defineInvoke(context, screenCapture.requestMacOSPermission);
	async function getSources() {
		return invokeGetSources(toRaw(toValue(sourcesOptions)));
	}
	async function selectWithSource(selectFn, useFn, request) {
		const sourceId = selectFn(await getSources());
		let handle;
		try {
			handle = await setSource({
				options: toRaw(toValue(sourcesOptions)),
				sourceId,
				timeout: request?.timeout
			});
			return await useFn();
		} finally {
			if (handle) await resetSource(handle);
		}
	}
	return {
		getSources,
		setSource,
		resetSource,
		selectWithSource,
		checkMacOSPermission,
		requestMacOSPermission
	};
}

//#endregion
export { useElectronScreenCapture };