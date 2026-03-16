import { defineInvoke } from "./node_modules/.pnpm/@moeru_eventa@1.0.0-alpha.14_electron@39.7.0/node_modules/@moeru/eventa/dist/src-OOE3RB9u.js";
import { screenCaptureCheckMacOSPermission, screenCaptureGetSources, screenCaptureRequestMacOSPermission, screenCaptureResetSource, screenCaptureSetSourceEx } from "./index.js";

//#region src/renderer.ts
function setupElectronScreenCapture(context) {
	const invokeGetSources = defineInvoke(context, screenCaptureGetSources);
	const setSource = defineInvoke(context, screenCaptureSetSourceEx);
	const resetSource = defineInvoke(context, screenCaptureResetSource);
	const checkMacOSPermission = defineInvoke(context, screenCaptureCheckMacOSPermission);
	const requestMacOSPermission = defineInvoke(context, screenCaptureRequestMacOSPermission);
	async function getSources(sourcesOptions) {
		return invokeGetSources(sourcesOptions);
	}
	async function selectWithSource(selectFn, useFn, options) {
		const sourceId = await selectFn(await getSources(options?.sourcesOptions));
		let handle;
		try {
			handle = await setSource({
				options: options?.sourcesOptions,
				sourceId,
				timeout: options?.request?.timeout
			});
			return await useFn();
		} finally {
			if (handle) await resetSource(handle);
		}
	}
	return {
		getSources,
		setSource,
		selectWithSource,
		resetSource,
		checkMacOSPermission,
		requestMacOSPermission
	};
}

//#endregion
export { setupElectronScreenCapture };