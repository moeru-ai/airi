import en_default from "./en/index.mjs";
import es_default from "./es/index.mjs";
import fr_default from "./fr/index.mjs";
import ja_default from "./ja/index.mjs";
import ko_default from "./ko/index.mjs";
import ru_default from "./ru/index.mjs";
import vi_default from "./vi/index.mjs";
import zh_Hans_default from "./zh-Hans/index.mjs";
import zh_Hant_default from "./zh-Hant/index.mjs";

//#region src/locales/index.ts
var locales_default = {
	en: en_default,
	es: es_default,
	fr: fr_default,
	ko: ko_default,
	ja: ja_default,
	ru: ru_default,
	vi: vi_default,
	"zh-Hans": zh_Hans_default,
	"zh-Hant": zh_Hant_default
};

//#endregion
export { locales_default as default };