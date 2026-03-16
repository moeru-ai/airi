import data from "./base.mjs";
import docs_default from "./docs/index.mjs";
import data$1 from "./settings.mjs";
import data$2 from "./stage.mjs";
import tamagotchi_default from "./tamagotchi/index.mjs";

//#region src/locales/ko/index.ts
var ko_default = {
	base: data,
	docs: docs_default,
	settings: data$1,
	stage: data$2,
	tamagotchi: tamagotchi_default
};

//#endregion
export { ko_default as default };