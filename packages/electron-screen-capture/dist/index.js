import { defineInvokeEventa } from "./node_modules/.pnpm/@moeru_eventa@1.0.0-alpha.14_electron@39.7.0/node_modules/@moeru/eventa/dist/src-OOE3RB9u.js";

//#region src/index.ts
const screenCaptureGetSources = defineInvokeEventa("eventa:invoke:electron:screen-capture:get-sources");
const screenCaptureSetSourceEx = defineInvokeEventa("eventa:invoke:electron:screen-capture:set-source");
const screenCaptureResetSource = defineInvokeEventa("eventa:invoke:electron:screen-capture:reset-source");
const screenCaptureCheckMacOSPermission = defineInvokeEventa("eventa:invoke:electron:screen-capture:check-macos-permission");
const screenCaptureRequestMacOSPermission = defineInvokeEventa("eventa:invoke:electron:screen-capture:request-macos-permission");
const screenCapture = {
	getSources: screenCaptureGetSources,
	setSource: screenCaptureSetSourceEx,
	resetSource: screenCaptureResetSource,
	checkMacOSPermission: screenCaptureCheckMacOSPermission,
	requestMacOSPermission: screenCaptureRequestMacOSPermission
};

//#endregion
export { screenCapture, screenCaptureCheckMacOSPermission, screenCaptureGetSources, screenCaptureRequestMacOSPermission, screenCaptureResetSource, screenCaptureSetSourceEx };