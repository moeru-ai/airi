import { defineEventa, defineInvokeEventa } from "@moeru/eventa";

//#region src/electron-updater/index.ts
const electronAutoUpdaterStateChanged = defineEventa("eventa:event:electron:auto-updater:state-changed");
const autoUpdater = {
	getState: defineInvokeEventa("eventa:invoke:electron:auto-updater:get-state"),
	checkForUpdates: defineInvokeEventa("eventa:invoke:electron:auto-updater:check-for-updates"),
	downloadUpdate: defineInvokeEventa("eventa:invoke:electron:auto-updater:download-update"),
	quitAndInstall: defineInvokeEventa("eventa:invoke:electron:auto-updater:quit-and-install")
};

//#endregion
export { autoUpdater, electronAutoUpdaterStateChanged };