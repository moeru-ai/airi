import electron_default from "./electron/index.mjs";
import data from "./settings.mjs";
import data$1 from "./stage.mjs";

//#region src/locales/es/tamagotchi/index.ts
var tamagotchi_default = {
	stage: data$1,
	settings: data,
	electron: electron_default
};

//#endregion
export { tamagotchi_default as default };