import { useLogg } from "@guiiai/logg";
import { webcrypto } from "node:crypto";
import { app, desktopCapturer, ipcMain, session, shell, systemPreferences } from "electron";
import { isMacOS } from "std-env";

//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) {
				__defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
		}
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
//#region ../../node_modules/.pnpm/picomatch@4.0.3/node_modules/picomatch/lib/constants.js
var require_constants = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const WIN_SLASH = "\\\\/";
	const WIN_NO_SLASH = `[^${WIN_SLASH}]`;
	/**
	* Posix glob regex
	*/
	const DOT_LITERAL = "\\.";
	const PLUS_LITERAL = "\\+";
	const QMARK_LITERAL = "\\?";
	const SLASH_LITERAL = "\\/";
	const ONE_CHAR = "(?=.)";
	const QMARK = "[^/]";
	const END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
	const START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
	const DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
	const POSIX_CHARS = {
		DOT_LITERAL,
		PLUS_LITERAL,
		QMARK_LITERAL,
		SLASH_LITERAL,
		ONE_CHAR,
		QMARK,
		END_ANCHOR,
		DOTS_SLASH,
		NO_DOT: `(?!${DOT_LITERAL})`,
		NO_DOTS: `(?!${START_ANCHOR}${DOTS_SLASH})`,
		NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`,
		NO_DOTS_SLASH: `(?!${DOTS_SLASH})`,
		QMARK_NO_DOT: `[^.${SLASH_LITERAL}]`,
		STAR: `${QMARK}*?`,
		START_ANCHOR,
		SEP: "/"
	};
	/**
	* Windows glob regex
	*/
	const WINDOWS_CHARS = {
		...POSIX_CHARS,
		SLASH_LITERAL: `[${WIN_SLASH}]`,
		QMARK: WIN_NO_SLASH,
		STAR: `${WIN_NO_SLASH}*?`,
		DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
		NO_DOT: `(?!${DOT_LITERAL})`,
		NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
		NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
		NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
		QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
		START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
		END_ANCHOR: `(?:[${WIN_SLASH}]|$)`,
		SEP: "\\"
	};
	/**
	* POSIX Bracket Regex
	*/
	const POSIX_REGEX_SOURCE = {
		alnum: "a-zA-Z0-9",
		alpha: "a-zA-Z",
		ascii: "\\x00-\\x7F",
		blank: " \\t",
		cntrl: "\\x00-\\x1F\\x7F",
		digit: "0-9",
		graph: "\\x21-\\x7E",
		lower: "a-z",
		print: "\\x20-\\x7E ",
		punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
		space: " \\t\\r\\n\\v\\f",
		upper: "A-Z",
		word: "A-Za-z0-9_",
		xdigit: "A-Fa-f0-9"
	};
	module.exports = {
		MAX_LENGTH: 1024 * 64,
		POSIX_REGEX_SOURCE,
		REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
		REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
		REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
		REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
		REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
		REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
		REPLACEMENTS: {
			__proto__: null,
			"***": "*",
			"**/**": "**",
			"**/**/**": "**"
		},
		CHAR_0: 48,
		CHAR_9: 57,
		CHAR_UPPERCASE_A: 65,
		CHAR_LOWERCASE_A: 97,
		CHAR_UPPERCASE_Z: 90,
		CHAR_LOWERCASE_Z: 122,
		CHAR_LEFT_PARENTHESES: 40,
		CHAR_RIGHT_PARENTHESES: 41,
		CHAR_ASTERISK: 42,
		CHAR_AMPERSAND: 38,
		CHAR_AT: 64,
		CHAR_BACKWARD_SLASH: 92,
		CHAR_CARRIAGE_RETURN: 13,
		CHAR_CIRCUMFLEX_ACCENT: 94,
		CHAR_COLON: 58,
		CHAR_COMMA: 44,
		CHAR_DOT: 46,
		CHAR_DOUBLE_QUOTE: 34,
		CHAR_EQUAL: 61,
		CHAR_EXCLAMATION_MARK: 33,
		CHAR_FORM_FEED: 12,
		CHAR_FORWARD_SLASH: 47,
		CHAR_GRAVE_ACCENT: 96,
		CHAR_HASH: 35,
		CHAR_HYPHEN_MINUS: 45,
		CHAR_LEFT_ANGLE_BRACKET: 60,
		CHAR_LEFT_CURLY_BRACE: 123,
		CHAR_LEFT_SQUARE_BRACKET: 91,
		CHAR_LINE_FEED: 10,
		CHAR_NO_BREAK_SPACE: 160,
		CHAR_PERCENT: 37,
		CHAR_PLUS: 43,
		CHAR_QUESTION_MARK: 63,
		CHAR_RIGHT_ANGLE_BRACKET: 62,
		CHAR_RIGHT_CURLY_BRACE: 125,
		CHAR_RIGHT_SQUARE_BRACKET: 93,
		CHAR_SEMICOLON: 59,
		CHAR_SINGLE_QUOTE: 39,
		CHAR_SPACE: 32,
		CHAR_TAB: 9,
		CHAR_UNDERSCORE: 95,
		CHAR_VERTICAL_LINE: 124,
		CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
		extglobChars(chars) {
			return {
				"!": {
					type: "negate",
					open: "(?:(?!(?:",
					close: `))${chars.STAR})`
				},
				"?": {
					type: "qmark",
					open: "(?:",
					close: ")?"
				},
				"+": {
					type: "plus",
					open: "(?:",
					close: ")+"
				},
				"*": {
					type: "star",
					open: "(?:",
					close: ")*"
				},
				"@": {
					type: "at",
					open: "(?:",
					close: ")"
				}
			};
		},
		globChars(win32) {
			return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
		}
	};
}));

//#endregion
//#region ../../node_modules/.pnpm/picomatch@4.0.3/node_modules/picomatch/lib/utils.js
var require_utils = /* @__PURE__ */ __commonJSMin(((exports) => {
	const { REGEX_BACKSLASH, REGEX_REMOVE_BACKSLASH, REGEX_SPECIAL_CHARS, REGEX_SPECIAL_CHARS_GLOBAL } = require_constants();
	exports.isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
	exports.hasRegexChars = (str) => REGEX_SPECIAL_CHARS.test(str);
	exports.isRegexChar = (str) => str.length === 1 && exports.hasRegexChars(str);
	exports.escapeRegex = (str) => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
	exports.toPosixSlashes = (str) => str.replace(REGEX_BACKSLASH, "/");
	exports.isWindows = () => {
		if (typeof navigator !== "undefined" && navigator.platform) {
			const platform = navigator.platform.toLowerCase();
			return platform === "win32" || platform === "windows";
		}
		if (typeof process !== "undefined" && process.platform) return process.platform === "win32";
		return false;
	};
	exports.removeBackslashes = (str) => {
		return str.replace(REGEX_REMOVE_BACKSLASH, (match) => {
			return match === "\\" ? "" : match;
		});
	};
	exports.escapeLast = (input, char, lastIdx) => {
		const idx = input.lastIndexOf(char, lastIdx);
		if (idx === -1) return input;
		if (input[idx - 1] === "\\") return exports.escapeLast(input, char, idx - 1);
		return `${input.slice(0, idx)}\\${input.slice(idx)}`;
	};
	exports.removePrefix = (input, state = {}) => {
		let output = input;
		if (output.startsWith("./")) {
			output = output.slice(2);
			state.prefix = "./";
		}
		return output;
	};
	exports.wrapOutput = (input, state = {}, options = {}) => {
		let output = `${options.contains ? "" : "^"}(?:${input})${options.contains ? "" : "$"}`;
		if (state.negated === true) output = `(?:^(?!${output}).*$)`;
		return output;
	};
	exports.basename = (path, { windows } = {}) => {
		const segs = path.split(windows ? /[\\/]/ : "/");
		const last = segs[segs.length - 1];
		if (last === "") return segs[segs.length - 2];
		return last;
	};
}));

//#endregion
//#region ../../node_modules/.pnpm/picomatch@4.0.3/node_modules/picomatch/lib/scan.js
var require_scan = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const utils = require_utils();
	const { CHAR_ASTERISK, CHAR_AT, CHAR_BACKWARD_SLASH, CHAR_COMMA, CHAR_DOT, CHAR_EXCLAMATION_MARK, CHAR_FORWARD_SLASH, CHAR_LEFT_CURLY_BRACE, CHAR_LEFT_PARENTHESES, CHAR_LEFT_SQUARE_BRACKET, CHAR_PLUS, CHAR_QUESTION_MARK, CHAR_RIGHT_CURLY_BRACE, CHAR_RIGHT_PARENTHESES, CHAR_RIGHT_SQUARE_BRACKET } = require_constants();
	const isPathSeparator = (code) => {
		return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
	};
	const depth = (token) => {
		if (token.isPrefix !== true) token.depth = token.isGlobstar ? Infinity : 1;
	};
	/**
	* Quickly scans a glob pattern and returns an object with a handful of
	* useful properties, like `isGlob`, `path` (the leading non-glob, if it exists),
	* `glob` (the actual pattern), `negated` (true if the path starts with `!` but not
	* with `!(`) and `negatedExtglob` (true if the path starts with `!(`).
	*
	* ```js
	* const pm = require('picomatch');
	* console.log(pm.scan('foo/bar/*.js'));
	* { isGlob: true, input: 'foo/bar/*.js', base: 'foo/bar', glob: '*.js' }
	* ```
	* @param {String} `str`
	* @param {Object} `options`
	* @return {Object} Returns an object with tokens and regex source string.
	* @api public
	*/
	const scan = (input, options) => {
		const opts = options || {};
		const length = input.length - 1;
		const scanToEnd = opts.parts === true || opts.scanToEnd === true;
		const slashes = [];
		const tokens = [];
		const parts = [];
		let str = input;
		let index = -1;
		let start = 0;
		let lastIndex = 0;
		let isBrace = false;
		let isBracket = false;
		let isGlob = false;
		let isExtglob = false;
		let isGlobstar = false;
		let braceEscaped = false;
		let backslashes = false;
		let negated = false;
		let negatedExtglob = false;
		let finished = false;
		let braces = 0;
		let prev;
		let code;
		let token = {
			value: "",
			depth: 0,
			isGlob: false
		};
		const eos = () => index >= length;
		const peek = () => str.charCodeAt(index + 1);
		const advance = () => {
			prev = code;
			return str.charCodeAt(++index);
		};
		while (index < length) {
			code = advance();
			let next;
			if (code === CHAR_BACKWARD_SLASH) {
				backslashes = token.backslashes = true;
				code = advance();
				if (code === CHAR_LEFT_CURLY_BRACE) braceEscaped = true;
				continue;
			}
			if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
				braces++;
				while (eos() !== true && (code = advance())) {
					if (code === CHAR_BACKWARD_SLASH) {
						backslashes = token.backslashes = true;
						advance();
						continue;
					}
					if (code === CHAR_LEFT_CURLY_BRACE) {
						braces++;
						continue;
					}
					if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
						isBrace = token.isBrace = true;
						isGlob = token.isGlob = true;
						finished = true;
						if (scanToEnd === true) continue;
						break;
					}
					if (braceEscaped !== true && code === CHAR_COMMA) {
						isBrace = token.isBrace = true;
						isGlob = token.isGlob = true;
						finished = true;
						if (scanToEnd === true) continue;
						break;
					}
					if (code === CHAR_RIGHT_CURLY_BRACE) {
						braces--;
						if (braces === 0) {
							braceEscaped = false;
							isBrace = token.isBrace = true;
							finished = true;
							break;
						}
					}
				}
				if (scanToEnd === true) continue;
				break;
			}
			if (code === CHAR_FORWARD_SLASH) {
				slashes.push(index);
				tokens.push(token);
				token = {
					value: "",
					depth: 0,
					isGlob: false
				};
				if (finished === true) continue;
				if (prev === CHAR_DOT && index === start + 1) {
					start += 2;
					continue;
				}
				lastIndex = index + 1;
				continue;
			}
			if (opts.noext !== true) {
				if ((code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK) === true && peek() === CHAR_LEFT_PARENTHESES) {
					isGlob = token.isGlob = true;
					isExtglob = token.isExtglob = true;
					finished = true;
					if (code === CHAR_EXCLAMATION_MARK && index === start) negatedExtglob = true;
					if (scanToEnd === true) {
						while (eos() !== true && (code = advance())) {
							if (code === CHAR_BACKWARD_SLASH) {
								backslashes = token.backslashes = true;
								code = advance();
								continue;
							}
							if (code === CHAR_RIGHT_PARENTHESES) {
								isGlob = token.isGlob = true;
								finished = true;
								break;
							}
						}
						continue;
					}
					break;
				}
			}
			if (code === CHAR_ASTERISK) {
				if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
				isGlob = token.isGlob = true;
				finished = true;
				if (scanToEnd === true) continue;
				break;
			}
			if (code === CHAR_QUESTION_MARK) {
				isGlob = token.isGlob = true;
				finished = true;
				if (scanToEnd === true) continue;
				break;
			}
			if (code === CHAR_LEFT_SQUARE_BRACKET) {
				while (eos() !== true && (next = advance())) {
					if (next === CHAR_BACKWARD_SLASH) {
						backslashes = token.backslashes = true;
						advance();
						continue;
					}
					if (next === CHAR_RIGHT_SQUARE_BRACKET) {
						isBracket = token.isBracket = true;
						isGlob = token.isGlob = true;
						finished = true;
						break;
					}
				}
				if (scanToEnd === true) continue;
				break;
			}
			if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
				negated = token.negated = true;
				start++;
				continue;
			}
			if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
				isGlob = token.isGlob = true;
				if (scanToEnd === true) {
					while (eos() !== true && (code = advance())) {
						if (code === CHAR_LEFT_PARENTHESES) {
							backslashes = token.backslashes = true;
							code = advance();
							continue;
						}
						if (code === CHAR_RIGHT_PARENTHESES) {
							finished = true;
							break;
						}
					}
					continue;
				}
				break;
			}
			if (isGlob === true) {
				finished = true;
				if (scanToEnd === true) continue;
				break;
			}
		}
		if (opts.noext === true) {
			isExtglob = false;
			isGlob = false;
		}
		let base = str;
		let prefix = "";
		let glob = "";
		if (start > 0) {
			prefix = str.slice(0, start);
			str = str.slice(start);
			lastIndex -= start;
		}
		if (base && isGlob === true && lastIndex > 0) {
			base = str.slice(0, lastIndex);
			glob = str.slice(lastIndex);
		} else if (isGlob === true) {
			base = "";
			glob = str;
		} else base = str;
		if (base && base !== "" && base !== "/" && base !== str) {
			if (isPathSeparator(base.charCodeAt(base.length - 1))) base = base.slice(0, -1);
		}
		if (opts.unescape === true) {
			if (glob) glob = utils.removeBackslashes(glob);
			if (base && backslashes === true) base = utils.removeBackslashes(base);
		}
		const state = {
			prefix,
			input,
			start,
			base,
			glob,
			isBrace,
			isBracket,
			isGlob,
			isExtglob,
			isGlobstar,
			negated,
			negatedExtglob
		};
		if (opts.tokens === true) {
			state.maxDepth = 0;
			if (!isPathSeparator(code)) tokens.push(token);
			state.tokens = tokens;
		}
		if (opts.parts === true || opts.tokens === true) {
			let prevIndex;
			for (let idx = 0; idx < slashes.length; idx++) {
				const n = prevIndex ? prevIndex + 1 : start;
				const i = slashes[idx];
				const value = input.slice(n, i);
				if (opts.tokens) {
					if (idx === 0 && start !== 0) {
						tokens[idx].isPrefix = true;
						tokens[idx].value = prefix;
					} else tokens[idx].value = value;
					depth(tokens[idx]);
					state.maxDepth += tokens[idx].depth;
				}
				if (idx !== 0 || value !== "") parts.push(value);
				prevIndex = i;
			}
			if (prevIndex && prevIndex + 1 < input.length) {
				const value = input.slice(prevIndex + 1);
				parts.push(value);
				if (opts.tokens) {
					tokens[tokens.length - 1].value = value;
					depth(tokens[tokens.length - 1]);
					state.maxDepth += tokens[tokens.length - 1].depth;
				}
			}
			state.slashes = slashes;
			state.parts = parts;
		}
		return state;
	};
	module.exports = scan;
}));

//#endregion
//#region ../../node_modules/.pnpm/picomatch@4.0.3/node_modules/picomatch/lib/parse.js
var require_parse = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const constants = require_constants();
	const utils = require_utils();
	/**
	* Constants
	*/
	const { MAX_LENGTH, POSIX_REGEX_SOURCE, REGEX_NON_SPECIAL_CHARS, REGEX_SPECIAL_CHARS_BACKREF, REPLACEMENTS } = constants;
	/**
	* Helpers
	*/
	const expandRange = (args, options) => {
		if (typeof options.expandRange === "function") return options.expandRange(...args, options);
		args.sort();
		const value = `[${args.join("-")}]`;
		try {
			new RegExp(value);
		} catch (ex) {
			return args.map((v) => utils.escapeRegex(v)).join("..");
		}
		return value;
	};
	/**
	* Create the message for a syntax error
	*/
	const syntaxError = (type, char) => {
		return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
	};
	/**
	* Parse the given input string.
	* @param {String} input
	* @param {Object} options
	* @return {Object}
	*/
	const parse = (input, options) => {
		if (typeof input !== "string") throw new TypeError("Expected a string");
		input = REPLACEMENTS[input] || input;
		const opts = { ...options };
		const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
		let len = input.length;
		if (len > max) throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
		const bos = {
			type: "bos",
			value: "",
			output: opts.prepend || ""
		};
		const tokens = [bos];
		const capture = opts.capture ? "" : "?:";
		const PLATFORM_CHARS = constants.globChars(opts.windows);
		const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
		const { DOT_LITERAL, PLUS_LITERAL, SLASH_LITERAL, ONE_CHAR, DOTS_SLASH, NO_DOT, NO_DOT_SLASH, NO_DOTS_SLASH, QMARK, QMARK_NO_DOT, STAR, START_ANCHOR } = PLATFORM_CHARS;
		const globstar = (opts) => {
			return `(${capture}(?:(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
		};
		const nodot = opts.dot ? "" : NO_DOT;
		const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
		let star = opts.bash === true ? globstar(opts) : STAR;
		if (opts.capture) star = `(${star})`;
		if (typeof opts.noext === "boolean") opts.noextglob = opts.noext;
		const state = {
			input,
			index: -1,
			start: 0,
			dot: opts.dot === true,
			consumed: "",
			output: "",
			prefix: "",
			backtrack: false,
			negated: false,
			brackets: 0,
			braces: 0,
			parens: 0,
			quotes: 0,
			globstar: false,
			tokens
		};
		input = utils.removePrefix(input, state);
		len = input.length;
		const extglobs = [];
		const braces = [];
		const stack = [];
		let prev = bos;
		let value;
		/**
		* Tokenizing helpers
		*/
		const eos = () => state.index === len - 1;
		const peek = state.peek = (n = 1) => input[state.index + n];
		const advance = state.advance = () => input[++state.index] || "";
		const remaining = () => input.slice(state.index + 1);
		const consume = (value = "", num = 0) => {
			state.consumed += value;
			state.index += num;
		};
		const append = (token) => {
			state.output += token.output != null ? token.output : token.value;
			consume(token.value);
		};
		const negate = () => {
			let count = 1;
			while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
				advance();
				state.start++;
				count++;
			}
			if (count % 2 === 0) return false;
			state.negated = true;
			state.start++;
			return true;
		};
		const increment = (type) => {
			state[type]++;
			stack.push(type);
		};
		const decrement = (type) => {
			state[type]--;
			stack.pop();
		};
		/**
		* Push tokens onto the tokens array. This helper speeds up
		* tokenizing by 1) helping us avoid backtracking as much as possible,
		* and 2) helping us avoid creating extra tokens when consecutive
		* characters are plain text. This improves performance and simplifies
		* lookbehinds.
		*/
		const push = (tok) => {
			if (prev.type === "globstar") {
				const isBrace = state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
				const isExtglob = tok.extglob === true || extglobs.length && (tok.type === "pipe" || tok.type === "paren");
				if (tok.type !== "slash" && tok.type !== "paren" && !isBrace && !isExtglob) {
					state.output = state.output.slice(0, -prev.output.length);
					prev.type = "star";
					prev.value = "*";
					prev.output = star;
					state.output += prev.output;
				}
			}
			if (extglobs.length && tok.type !== "paren") extglobs[extglobs.length - 1].inner += tok.value;
			if (tok.value || tok.output) append(tok);
			if (prev && prev.type === "text" && tok.type === "text") {
				prev.output = (prev.output || prev.value) + tok.value;
				prev.value += tok.value;
				return;
			}
			tok.prev = prev;
			tokens.push(tok);
			prev = tok;
		};
		const extglobOpen = (type, value) => {
			const token = {
				...EXTGLOB_CHARS[value],
				conditions: 1,
				inner: ""
			};
			token.prev = prev;
			token.parens = state.parens;
			token.output = state.output;
			const output = (opts.capture ? "(" : "") + token.open;
			increment("parens");
			push({
				type,
				value,
				output: state.output ? "" : ONE_CHAR
			});
			push({
				type: "paren",
				extglob: true,
				value: advance(),
				output
			});
			extglobs.push(token);
		};
		const extglobClose = (token) => {
			let output = token.close + (opts.capture ? ")" : "");
			let rest;
			if (token.type === "negate") {
				let extglobStar = star;
				if (token.inner && token.inner.length > 1 && token.inner.includes("/")) extglobStar = globstar(opts);
				if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) output = token.close = `)$))${extglobStar}`;
				if (token.inner.includes("*") && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) output = token.close = `)${parse(rest, {
					...options,
					fastpaths: false
				}).output})${extglobStar})`;
				if (token.prev.type === "bos") state.negatedExtglob = true;
			}
			push({
				type: "paren",
				extglob: true,
				value,
				output
			});
			decrement("parens");
		};
		/**
		* Fast paths
		*/
		if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
			let backslashes = false;
			let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
				if (first === "\\") {
					backslashes = true;
					return m;
				}
				if (first === "?") {
					if (esc) return esc + first + (rest ? QMARK.repeat(rest.length) : "");
					if (index === 0) return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : "");
					return QMARK.repeat(chars.length);
				}
				if (first === ".") return DOT_LITERAL.repeat(chars.length);
				if (first === "*") {
					if (esc) return esc + first + (rest ? star : "");
					return star;
				}
				return esc ? m : `\\${m}`;
			});
			if (backslashes === true) if (opts.unescape === true) output = output.replace(/\\/g, "");
			else output = output.replace(/\\+/g, (m) => {
				return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
			});
			if (output === input && opts.contains === true) {
				state.output = input;
				return state;
			}
			state.output = utils.wrapOutput(output, state, options);
			return state;
		}
		/**
		* Tokenize input until we reach end-of-string
		*/
		while (!eos()) {
			value = advance();
			if (value === "\0") continue;
			/**
			* Escaped characters
			*/
			if (value === "\\") {
				const next = peek();
				if (next === "/" && opts.bash !== true) continue;
				if (next === "." || next === ";") continue;
				if (!next) {
					value += "\\";
					push({
						type: "text",
						value
					});
					continue;
				}
				const match = /^\\+/.exec(remaining());
				let slashes = 0;
				if (match && match[0].length > 2) {
					slashes = match[0].length;
					state.index += slashes;
					if (slashes % 2 !== 0) value += "\\";
				}
				if (opts.unescape === true) value = advance();
				else value += advance();
				if (state.brackets === 0) {
					push({
						type: "text",
						value
					});
					continue;
				}
			}
			/**
			* If we're inside a regex character class, continue
			* until we reach the closing bracket.
			*/
			if (state.brackets > 0 && (value !== "]" || prev.value === "[" || prev.value === "[^")) {
				if (opts.posix !== false && value === ":") {
					const inner = prev.value.slice(1);
					if (inner.includes("[")) {
						prev.posix = true;
						if (inner.includes(":")) {
							const idx = prev.value.lastIndexOf("[");
							const pre = prev.value.slice(0, idx);
							const posix = POSIX_REGEX_SOURCE[prev.value.slice(idx + 2)];
							if (posix) {
								prev.value = pre + posix;
								state.backtrack = true;
								advance();
								if (!bos.output && tokens.indexOf(prev) === 1) bos.output = ONE_CHAR;
								continue;
							}
						}
					}
				}
				if (value === "[" && peek() !== ":" || value === "-" && peek() === "]") value = `\\${value}`;
				if (value === "]" && (prev.value === "[" || prev.value === "[^")) value = `\\${value}`;
				if (opts.posix === true && value === "!" && prev.value === "[") value = "^";
				prev.value += value;
				append({ value });
				continue;
			}
			/**
			* If we're inside a quoted string, continue
			* until we reach the closing double quote.
			*/
			if (state.quotes === 1 && value !== "\"") {
				value = utils.escapeRegex(value);
				prev.value += value;
				append({ value });
				continue;
			}
			/**
			* Double quotes
			*/
			if (value === "\"") {
				state.quotes = state.quotes === 1 ? 0 : 1;
				if (opts.keepQuotes === true) push({
					type: "text",
					value
				});
				continue;
			}
			/**
			* Parentheses
			*/
			if (value === "(") {
				increment("parens");
				push({
					type: "paren",
					value
				});
				continue;
			}
			if (value === ")") {
				if (state.parens === 0 && opts.strictBrackets === true) throw new SyntaxError(syntaxError("opening", "("));
				const extglob = extglobs[extglobs.length - 1];
				if (extglob && state.parens === extglob.parens + 1) {
					extglobClose(extglobs.pop());
					continue;
				}
				push({
					type: "paren",
					value,
					output: state.parens ? ")" : "\\)"
				});
				decrement("parens");
				continue;
			}
			/**
			* Square brackets
			*/
			if (value === "[") {
				if (opts.nobracket === true || !remaining().includes("]")) {
					if (opts.nobracket !== true && opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "]"));
					value = `\\${value}`;
				} else increment("brackets");
				push({
					type: "bracket",
					value
				});
				continue;
			}
			if (value === "]") {
				if (opts.nobracket === true || prev && prev.type === "bracket" && prev.value.length === 1) {
					push({
						type: "text",
						value,
						output: `\\${value}`
					});
					continue;
				}
				if (state.brackets === 0) {
					if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("opening", "["));
					push({
						type: "text",
						value,
						output: `\\${value}`
					});
					continue;
				}
				decrement("brackets");
				const prevValue = prev.value.slice(1);
				if (prev.posix !== true && prevValue[0] === "^" && !prevValue.includes("/")) value = `/${value}`;
				prev.value += value;
				append({ value });
				if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) continue;
				const escaped = utils.escapeRegex(prev.value);
				state.output = state.output.slice(0, -prev.value.length);
				if (opts.literalBrackets === true) {
					state.output += escaped;
					prev.value = escaped;
					continue;
				}
				prev.value = `(${capture}${escaped}|${prev.value})`;
				state.output += prev.value;
				continue;
			}
			/**
			* Braces
			*/
			if (value === "{" && opts.nobrace !== true) {
				increment("braces");
				const open = {
					type: "brace",
					value,
					output: "(",
					outputIndex: state.output.length,
					tokensIndex: state.tokens.length
				};
				braces.push(open);
				push(open);
				continue;
			}
			if (value === "}") {
				const brace = braces[braces.length - 1];
				if (opts.nobrace === true || !brace) {
					push({
						type: "text",
						value,
						output: value
					});
					continue;
				}
				let output = ")";
				if (brace.dots === true) {
					const arr = tokens.slice();
					const range = [];
					for (let i = arr.length - 1; i >= 0; i--) {
						tokens.pop();
						if (arr[i].type === "brace") break;
						if (arr[i].type !== "dots") range.unshift(arr[i].value);
					}
					output = expandRange(range, opts);
					state.backtrack = true;
				}
				if (brace.comma !== true && brace.dots !== true) {
					const out = state.output.slice(0, brace.outputIndex);
					const toks = state.tokens.slice(brace.tokensIndex);
					brace.value = brace.output = "\\{";
					value = output = "\\}";
					state.output = out;
					for (const t of toks) state.output += t.output || t.value;
				}
				push({
					type: "brace",
					value,
					output
				});
				decrement("braces");
				braces.pop();
				continue;
			}
			/**
			* Pipes
			*/
			if (value === "|") {
				if (extglobs.length > 0) extglobs[extglobs.length - 1].conditions++;
				push({
					type: "text",
					value
				});
				continue;
			}
			/**
			* Commas
			*/
			if (value === ",") {
				let output = value;
				const brace = braces[braces.length - 1];
				if (brace && stack[stack.length - 1] === "braces") {
					brace.comma = true;
					output = "|";
				}
				push({
					type: "comma",
					value,
					output
				});
				continue;
			}
			/**
			* Slashes
			*/
			if (value === "/") {
				if (prev.type === "dot" && state.index === state.start + 1) {
					state.start = state.index + 1;
					state.consumed = "";
					state.output = "";
					tokens.pop();
					prev = bos;
					continue;
				}
				push({
					type: "slash",
					value,
					output: SLASH_LITERAL
				});
				continue;
			}
			/**
			* Dots
			*/
			if (value === ".") {
				if (state.braces > 0 && prev.type === "dot") {
					if (prev.value === ".") prev.output = DOT_LITERAL;
					const brace = braces[braces.length - 1];
					prev.type = "dots";
					prev.output += value;
					prev.value += value;
					brace.dots = true;
					continue;
				}
				if (state.braces + state.parens === 0 && prev.type !== "bos" && prev.type !== "slash") {
					push({
						type: "text",
						value,
						output: DOT_LITERAL
					});
					continue;
				}
				push({
					type: "dot",
					value,
					output: DOT_LITERAL
				});
				continue;
			}
			/**
			* Question marks
			*/
			if (value === "?") {
				if (!(prev && prev.value === "(") && opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
					extglobOpen("qmark", value);
					continue;
				}
				if (prev && prev.type === "paren") {
					const next = peek();
					let output = value;
					if (prev.value === "(" && !/[!=<:]/.test(next) || next === "<" && !/<([!=]|\w+>)/.test(remaining())) output = `\\${value}`;
					push({
						type: "text",
						value,
						output
					});
					continue;
				}
				if (opts.dot !== true && (prev.type === "slash" || prev.type === "bos")) {
					push({
						type: "qmark",
						value,
						output: QMARK_NO_DOT
					});
					continue;
				}
				push({
					type: "qmark",
					value,
					output: QMARK
				});
				continue;
			}
			/**
			* Exclamation
			*/
			if (value === "!") {
				if (opts.noextglob !== true && peek() === "(") {
					if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
						extglobOpen("negate", value);
						continue;
					}
				}
				if (opts.nonegate !== true && state.index === 0) {
					negate();
					continue;
				}
			}
			/**
			* Plus
			*/
			if (value === "+") {
				if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
					extglobOpen("plus", value);
					continue;
				}
				if (prev && prev.value === "(" || opts.regex === false) {
					push({
						type: "plus",
						value,
						output: PLUS_LITERAL
					});
					continue;
				}
				if (prev && (prev.type === "bracket" || prev.type === "paren" || prev.type === "brace") || state.parens > 0) {
					push({
						type: "plus",
						value
					});
					continue;
				}
				push({
					type: "plus",
					value: PLUS_LITERAL
				});
				continue;
			}
			/**
			* Plain text
			*/
			if (value === "@") {
				if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
					push({
						type: "at",
						extglob: true,
						value,
						output: ""
					});
					continue;
				}
				push({
					type: "text",
					value
				});
				continue;
			}
			/**
			* Plain text
			*/
			if (value !== "*") {
				if (value === "$" || value === "^") value = `\\${value}`;
				const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
				if (match) {
					value += match[0];
					state.index += match[0].length;
				}
				push({
					type: "text",
					value
				});
				continue;
			}
			/**
			* Stars
			*/
			if (prev && (prev.type === "globstar" || prev.star === true)) {
				prev.type = "star";
				prev.star = true;
				prev.value += value;
				prev.output = star;
				state.backtrack = true;
				state.globstar = true;
				consume(value);
				continue;
			}
			let rest = remaining();
			if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
				extglobOpen("star", value);
				continue;
			}
			if (prev.type === "star") {
				if (opts.noglobstar === true) {
					consume(value);
					continue;
				}
				const prior = prev.prev;
				const before = prior.prev;
				const isStart = prior.type === "slash" || prior.type === "bos";
				const afterStar = before && (before.type === "star" || before.type === "globstar");
				if (opts.bash === true && (!isStart || rest[0] && rest[0] !== "/")) {
					push({
						type: "star",
						value,
						output: ""
					});
					continue;
				}
				const isBrace = state.braces > 0 && (prior.type === "comma" || prior.type === "brace");
				const isExtglob = extglobs.length && (prior.type === "pipe" || prior.type === "paren");
				if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
					push({
						type: "star",
						value,
						output: ""
					});
					continue;
				}
				while (rest.slice(0, 3) === "/**") {
					const after = input[state.index + 4];
					if (after && after !== "/") break;
					rest = rest.slice(3);
					consume("/**", 3);
				}
				if (prior.type === "bos" && eos()) {
					prev.type = "globstar";
					prev.value += value;
					prev.output = globstar(opts);
					state.output = prev.output;
					state.globstar = true;
					consume(value);
					continue;
				}
				if (prior.type === "slash" && prior.prev.type !== "bos" && !afterStar && eos()) {
					state.output = state.output.slice(0, -(prior.output + prev.output).length);
					prior.output = `(?:${prior.output}`;
					prev.type = "globstar";
					prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
					prev.value += value;
					state.globstar = true;
					state.output += prior.output + prev.output;
					consume(value);
					continue;
				}
				if (prior.type === "slash" && prior.prev.type !== "bos" && rest[0] === "/") {
					const end = rest[1] !== void 0 ? "|$" : "";
					state.output = state.output.slice(0, -(prior.output + prev.output).length);
					prior.output = `(?:${prior.output}`;
					prev.type = "globstar";
					prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
					prev.value += value;
					state.output += prior.output + prev.output;
					state.globstar = true;
					consume(value + advance());
					push({
						type: "slash",
						value: "/",
						output: ""
					});
					continue;
				}
				if (prior.type === "bos" && rest[0] === "/") {
					prev.type = "globstar";
					prev.value += value;
					prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
					state.output = prev.output;
					state.globstar = true;
					consume(value + advance());
					push({
						type: "slash",
						value: "/",
						output: ""
					});
					continue;
				}
				state.output = state.output.slice(0, -prev.output.length);
				prev.type = "globstar";
				prev.output = globstar(opts);
				prev.value += value;
				state.output += prev.output;
				state.globstar = true;
				consume(value);
				continue;
			}
			const token = {
				type: "star",
				value,
				output: star
			};
			if (opts.bash === true) {
				token.output = ".*?";
				if (prev.type === "bos" || prev.type === "slash") token.output = nodot + token.output;
				push(token);
				continue;
			}
			if (prev && (prev.type === "bracket" || prev.type === "paren") && opts.regex === true) {
				token.output = value;
				push(token);
				continue;
			}
			if (state.index === state.start || prev.type === "slash" || prev.type === "dot") {
				if (prev.type === "dot") {
					state.output += NO_DOT_SLASH;
					prev.output += NO_DOT_SLASH;
				} else if (opts.dot === true) {
					state.output += NO_DOTS_SLASH;
					prev.output += NO_DOTS_SLASH;
				} else {
					state.output += nodot;
					prev.output += nodot;
				}
				if (peek() !== "*") {
					state.output += ONE_CHAR;
					prev.output += ONE_CHAR;
				}
			}
			push(token);
		}
		while (state.brackets > 0) {
			if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "]"));
			state.output = utils.escapeLast(state.output, "[");
			decrement("brackets");
		}
		while (state.parens > 0) {
			if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", ")"));
			state.output = utils.escapeLast(state.output, "(");
			decrement("parens");
		}
		while (state.braces > 0) {
			if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "}"));
			state.output = utils.escapeLast(state.output, "{");
			decrement("braces");
		}
		if (opts.strictSlashes !== true && (prev.type === "star" || prev.type === "bracket")) push({
			type: "maybe_slash",
			value: "",
			output: `${SLASH_LITERAL}?`
		});
		if (state.backtrack === true) {
			state.output = "";
			for (const token of state.tokens) {
				state.output += token.output != null ? token.output : token.value;
				if (token.suffix) state.output += token.suffix;
			}
		}
		return state;
	};
	/**
	* Fast paths for creating regular expressions for common glob patterns.
	* This can significantly speed up processing and has very little downside
	* impact when none of the fast paths match.
	*/
	parse.fastpaths = (input, options) => {
		const opts = { ...options };
		const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
		const len = input.length;
		if (len > max) throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
		input = REPLACEMENTS[input] || input;
		const { DOT_LITERAL, SLASH_LITERAL, ONE_CHAR, DOTS_SLASH, NO_DOT, NO_DOTS, NO_DOTS_SLASH, STAR, START_ANCHOR } = constants.globChars(opts.windows);
		const nodot = opts.dot ? NO_DOTS : NO_DOT;
		const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
		const capture = opts.capture ? "" : "?:";
		const state = {
			negated: false,
			prefix: ""
		};
		let star = opts.bash === true ? ".*?" : STAR;
		if (opts.capture) star = `(${star})`;
		const globstar = (opts) => {
			if (opts.noglobstar === true) return star;
			return `(${capture}(?:(?!${START_ANCHOR}${opts.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
		};
		const create = (str) => {
			switch (str) {
				case "*": return `${nodot}${ONE_CHAR}${star}`;
				case ".*": return `${DOT_LITERAL}${ONE_CHAR}${star}`;
				case "*.*": return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
				case "*/*": return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
				case "**": return nodot + globstar(opts);
				case "**/*": return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
				case "**/*.*": return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
				case "**/.*": return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
				default: {
					const match = /^(.*?)\.(\w+)$/.exec(str);
					if (!match) return;
					const source = create(match[1]);
					if (!source) return;
					return source + DOT_LITERAL + match[2];
				}
			}
		};
		let source = create(utils.removePrefix(input, state));
		if (source && opts.strictSlashes !== true) source += `${SLASH_LITERAL}?`;
		return source;
	};
	module.exports = parse;
}));

//#endregion
//#region ../../node_modules/.pnpm/picomatch@4.0.3/node_modules/picomatch/lib/picomatch.js
var require_picomatch$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const scan = require_scan();
	const parse = require_parse();
	const utils = require_utils();
	const constants = require_constants();
	const isObject = (val) => val && typeof val === "object" && !Array.isArray(val);
	/**
	* Creates a matcher function from one or more glob patterns. The
	* returned function takes a string to match as its first argument,
	* and returns true if the string is a match. The returned matcher
	* function also takes a boolean as the second argument that, when true,
	* returns an object with additional information.
	*
	* ```js
	* const picomatch = require('picomatch');
	* // picomatch(glob[, options]);
	*
	* const isMatch = picomatch('*.!(*a)');
	* console.log(isMatch('a.a')); //=> false
	* console.log(isMatch('a.b')); //=> true
	* ```
	* @name picomatch
	* @param {String|Array} `globs` One or more glob patterns.
	* @param {Object=} `options`
	* @return {Function=} Returns a matcher function.
	* @api public
	*/
	const picomatch = (glob, options, returnState = false) => {
		if (Array.isArray(glob)) {
			const fns = glob.map((input) => picomatch(input, options, returnState));
			const arrayMatcher = (str) => {
				for (const isMatch of fns) {
					const state = isMatch(str);
					if (state) return state;
				}
				return false;
			};
			return arrayMatcher;
		}
		const isState = isObject(glob) && glob.tokens && glob.input;
		if (glob === "" || typeof glob !== "string" && !isState) throw new TypeError("Expected pattern to be a non-empty string");
		const opts = options || {};
		const posix = opts.windows;
		const regex = isState ? picomatch.compileRe(glob, options) : picomatch.makeRe(glob, options, false, true);
		const state = regex.state;
		delete regex.state;
		let isIgnored = () => false;
		if (opts.ignore) {
			const ignoreOpts = {
				...options,
				ignore: null,
				onMatch: null,
				onResult: null
			};
			isIgnored = picomatch(opts.ignore, ignoreOpts, returnState);
		}
		const matcher = (input, returnObject = false) => {
			const { isMatch, match, output } = picomatch.test(input, regex, options, {
				glob,
				posix
			});
			const result = {
				glob,
				state,
				regex,
				posix,
				input,
				output,
				match,
				isMatch
			};
			if (typeof opts.onResult === "function") opts.onResult(result);
			if (isMatch === false) {
				result.isMatch = false;
				return returnObject ? result : false;
			}
			if (isIgnored(input)) {
				if (typeof opts.onIgnore === "function") opts.onIgnore(result);
				result.isMatch = false;
				return returnObject ? result : false;
			}
			if (typeof opts.onMatch === "function") opts.onMatch(result);
			return returnObject ? result : true;
		};
		if (returnState) matcher.state = state;
		return matcher;
	};
	/**
	* Test `input` with the given `regex`. This is used by the main
	* `picomatch()` function to test the input string.
	*
	* ```js
	* const picomatch = require('picomatch');
	* // picomatch.test(input, regex[, options]);
	*
	* console.log(picomatch.test('foo/bar', /^(?:([^/]*?)\/([^/]*?))$/));
	* // { isMatch: true, match: [ 'foo/', 'foo', 'bar' ], output: 'foo/bar' }
	* ```
	* @param {String} `input` String to test.
	* @param {RegExp} `regex`
	* @return {Object} Returns an object with matching info.
	* @api public
	*/
	picomatch.test = (input, regex, options, { glob, posix } = {}) => {
		if (typeof input !== "string") throw new TypeError("Expected input to be a string");
		if (input === "") return {
			isMatch: false,
			output: ""
		};
		const opts = options || {};
		const format = opts.format || (posix ? utils.toPosixSlashes : null);
		let match = input === glob;
		let output = match && format ? format(input) : input;
		if (match === false) {
			output = format ? format(input) : input;
			match = output === glob;
		}
		if (match === false || opts.capture === true) if (opts.matchBase === true || opts.basename === true) match = picomatch.matchBase(input, regex, options, posix);
		else match = regex.exec(output);
		return {
			isMatch: Boolean(match),
			match,
			output
		};
	};
	/**
	* Match the basename of a filepath.
	*
	* ```js
	* const picomatch = require('picomatch');
	* // picomatch.matchBase(input, glob[, options]);
	* console.log(picomatch.matchBase('foo/bar.js', '*.js'); // true
	* ```
	* @param {String} `input` String to test.
	* @param {RegExp|String} `glob` Glob pattern or regex created by [.makeRe](#makeRe).
	* @return {Boolean}
	* @api public
	*/
	picomatch.matchBase = (input, glob, options) => {
		return (glob instanceof RegExp ? glob : picomatch.makeRe(glob, options)).test(utils.basename(input));
	};
	/**
	* Returns true if **any** of the given glob `patterns` match the specified `string`.
	*
	* ```js
	* const picomatch = require('picomatch');
	* // picomatch.isMatch(string, patterns[, options]);
	*
	* console.log(picomatch.isMatch('a.a', ['b.*', '*.a'])); //=> true
	* console.log(picomatch.isMatch('a.a', 'b.*')); //=> false
	* ```
	* @param {String|Array} str The string to test.
	* @param {String|Array} patterns One or more glob patterns to use for matching.
	* @param {Object} [options] See available [options](#options).
	* @return {Boolean} Returns true if any patterns match `str`
	* @api public
	*/
	picomatch.isMatch = (str, patterns, options) => picomatch(patterns, options)(str);
	/**
	* Parse a glob pattern to create the source string for a regular
	* expression.
	*
	* ```js
	* const picomatch = require('picomatch');
	* const result = picomatch.parse(pattern[, options]);
	* ```
	* @param {String} `pattern`
	* @param {Object} `options`
	* @return {Object} Returns an object with useful properties and output to be used as a regex source string.
	* @api public
	*/
	picomatch.parse = (pattern, options) => {
		if (Array.isArray(pattern)) return pattern.map((p) => picomatch.parse(p, options));
		return parse(pattern, {
			...options,
			fastpaths: false
		});
	};
	/**
	* Scan a glob pattern to separate the pattern into segments.
	*
	* ```js
	* const picomatch = require('picomatch');
	* // picomatch.scan(input[, options]);
	*
	* const result = picomatch.scan('!./foo/*.js');
	* console.log(result);
	* { prefix: '!./',
	*   input: '!./foo/*.js',
	*   start: 3,
	*   base: 'foo',
	*   glob: '*.js',
	*   isBrace: false,
	*   isBracket: false,
	*   isGlob: true,
	*   isExtglob: false,
	*   isGlobstar: false,
	*   negated: true }
	* ```
	* @param {String} `input` Glob pattern to scan.
	* @param {Object} `options`
	* @return {Object} Returns an object with
	* @api public
	*/
	picomatch.scan = (input, options) => scan(input, options);
	/**
	* Compile a regular expression from the `state` object returned by the
	* [parse()](#parse) method.
	*
	* @param {Object} `state`
	* @param {Object} `options`
	* @param {Boolean} `returnOutput` Intended for implementors, this argument allows you to return the raw output from the parser.
	* @param {Boolean} `returnState` Adds the state to a `state` property on the returned regex. Useful for implementors and debugging.
	* @return {RegExp}
	* @api public
	*/
	picomatch.compileRe = (state, options, returnOutput = false, returnState = false) => {
		if (returnOutput === true) return state.output;
		const opts = options || {};
		const prepend = opts.contains ? "" : "^";
		const append = opts.contains ? "" : "$";
		let source = `${prepend}(?:${state.output})${append}`;
		if (state && state.negated === true) source = `^(?!${source}).*$`;
		const regex = picomatch.toRegex(source, options);
		if (returnState === true) regex.state = state;
		return regex;
	};
	/**
	* Create a regular expression from a parsed glob pattern.
	*
	* ```js
	* const picomatch = require('picomatch');
	* const state = picomatch.parse('*.js');
	* // picomatch.compileRe(state[, options]);
	*
	* console.log(picomatch.compileRe(state));
	* //=> /^(?:(?!\.)(?=.)[^/]*?\.js)$/
	* ```
	* @param {String} `state` The object returned from the `.parse` method.
	* @param {Object} `options`
	* @param {Boolean} `returnOutput` Implementors may use this argument to return the compiled output, instead of a regular expression. This is not exposed on the options to prevent end-users from mutating the result.
	* @param {Boolean} `returnState` Implementors may use this argument to return the state from the parsed glob with the returned regular expression.
	* @return {RegExp} Returns a regex created from the given pattern.
	* @api public
	*/
	picomatch.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
		if (!input || typeof input !== "string") throw new TypeError("Expected a non-empty string");
		let parsed = {
			negated: false,
			fastpaths: true
		};
		if (options.fastpaths !== false && (input[0] === "." || input[0] === "*")) parsed.output = parse.fastpaths(input, options);
		if (!parsed.output) parsed = parse(input, options);
		return picomatch.compileRe(parsed, options, returnOutput, returnState);
	};
	/**
	* Create a regular expression from the given regex source string.
	*
	* ```js
	* const picomatch = require('picomatch');
	* // picomatch.toRegex(source[, options]);
	*
	* const { output } = picomatch.parse('*.js');
	* console.log(picomatch.toRegex(output));
	* //=> /^(?:(?!\.)(?=.)[^/]*?\.js)$/
	* ```
	* @param {String} `source` Regular expression source string.
	* @param {Object} `options`
	* @return {RegExp}
	* @api public
	*/
	picomatch.toRegex = (source, options) => {
		try {
			const opts = options || {};
			return new RegExp(source, opts.flags || (opts.nocase ? "i" : ""));
		} catch (err) {
			if (options && options.debug === true) throw err;
			return /$^/;
		}
	};
	/**
	* Picomatch constants.
	* @return {Object}
	*/
	picomatch.constants = constants;
	/**
	* Expose "picomatch"
	*/
	module.exports = picomatch;
}));

//#endregion
//#region ../../node_modules/.pnpm/picomatch@4.0.3/node_modules/picomatch/index.js
var require_picomatch = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const pico = require_picomatch$1();
	const utils = require_utils();
	function picomatch(glob, options, returnState = false) {
		if (options && (options.windows === null || options.windows === void 0)) options = {
			...options,
			windows: utils.isWindows()
		};
		return pico(glob, options, returnState);
	}
	Object.assign(picomatch, pico);
	module.exports = picomatch;
}));

//#endregion
//#region ../../node_modules/.pnpm/nanoid@5.1.6/node_modules/nanoid/url-alphabet/index.js
var import_picomatch = /* @__PURE__ */ __toESM(require_picomatch(), 1);
const urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

//#endregion
//#region ../../node_modules/.pnpm/nanoid@5.1.6/node_modules/nanoid/index.js
const POOL_SIZE_MULTIPLIER = 128;
let pool, poolOffset;
function fillPool(bytes) {
	if (!pool || pool.length < bytes) {
		pool = Buffer.allocUnsafe(bytes * POOL_SIZE_MULTIPLIER);
		webcrypto.getRandomValues(pool);
		poolOffset = 0;
	} else if (poolOffset + bytes > pool.length) {
		webcrypto.getRandomValues(pool);
		poolOffset = 0;
	}
	poolOffset += bytes;
}
function random(bytes) {
	fillPool(bytes |= 0);
	return pool.subarray(poolOffset - bytes, poolOffset);
}
function customRandom(alphabet, defaultSize, getRandom) {
	let mask = (2 << 31 - Math.clz32(alphabet.length - 1 | 1)) - 1;
	let step = Math.ceil(1.6 * mask * defaultSize / alphabet.length);
	return (size = defaultSize) => {
		if (!size) return "";
		let id = "";
		while (true) {
			let bytes = getRandom(step);
			let i = step;
			while (i--) {
				id += alphabet[bytes[i] & mask] || "";
				if (id.length >= size) return id;
			}
		}
	};
}
function customAlphabet(alphabet, size = 21) {
	return customRandom(alphabet, size, random);
}
function nanoid$1(size = 21) {
	fillPool(size |= 0);
	let id = "";
	for (let i = poolOffset - size; i < poolOffset; i++) id += urlAlphabet[pool[i] & 63];
	return id;
}

//#endregion
//#region ../../node_modules/.pnpm/@moeru+eventa@1.0.0-alpha.14_electron@39.7.0/node_modules/@moeru/eventa/dist/context-ex8urwfs.mjs
function nanoid() {
	return customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 16)();
}
let EventaType = /* @__PURE__ */ function(EventaType$1) {
	EventaType$1["Event"] = "event";
	EventaType$1["MatchExpression"] = "matchExpression";
	return EventaType$1;
}({});
let EventaFlowDirection = /* @__PURE__ */ function(EventaFlowDirection$1) {
	EventaFlowDirection$1["Inbound"] = "inbound";
	EventaFlowDirection$1["Outbound"] = "outbound";
	return EventaFlowDirection$1;
}({});
function defineInboundEventa(id) {
	return {
		...defineEventa(id),
		_flowDirection: EventaFlowDirection.Inbound
	};
}
function defineOutboundEventa(id) {
	return {
		...defineEventa(id),
		_flowDirection: EventaFlowDirection.Outbound
	};
}
function defineEventa(id) {
	if (!id) id = nanoid();
	return {
		id,
		type: EventaType.Event
	};
}
function and(...matchExpression) {
	return {
		id: nanoid(),
		type: EventaType.MatchExpression,
		matcher: (event) => {
			return matchExpression.every((m) => m.matcher ? m.matcher(event) : false);
		}
	};
}
function matchBy(matchExpressionPossibleValues, inverted) {
	const id = nanoid();
	let matcher = () => false;
	if (typeof matchExpressionPossibleValues === "string") matcher = (eventa) => {
		return (0, import_picomatch.default)(matchExpressionPossibleValues)(eventa.id);
	};
	else if (typeof matchExpressionPossibleValues === "object") {
		if ("ids" in matchExpressionPossibleValues) matcher = (event) => {
			if (inverted) return !matchExpressionPossibleValues.ids.includes(event.id);
			return matchExpressionPossibleValues.ids.includes(event.id);
		};
		else if ("eventa" in matchExpressionPossibleValues) matcher = (event) => {
			if (inverted) return !matchExpressionPossibleValues.eventa.some((e) => e.id === event.id);
			return matchExpressionPossibleValues.eventa.some((e) => e.id === event.id);
		};
		else if ("types" in matchExpressionPossibleValues) matcher = (event) => {
			if (typeof event.type === "undefined") return false;
			if (inverted) return !matchExpressionPossibleValues.types.includes(event.type);
			return matchExpressionPossibleValues.types.includes(event.type);
		};
	} else if (matchExpressionPossibleValues instanceof RegExp) matcher = (event) => {
		if (inverted) return !matchExpressionPossibleValues.test(event.id);
		return matchExpressionPossibleValues.test(event.id);
	};
	else if (typeof matchExpressionPossibleValues === "function") matcher = matchExpressionPossibleValues;
	return {
		id,
		type: EventaType.MatchExpression,
		matcher
	};
}
function createContext$1(props = {}) {
	const listeners = /* @__PURE__ */ new Map();
	const onceListeners = /* @__PURE__ */ new Map();
	const matchExpressions = /* @__PURE__ */ new Map();
	const matchExpressionListeners = /* @__PURE__ */ new Map();
	const matchExpressionOnceListeners = /* @__PURE__ */ new Map();
	const hooks = props.adapter?.(emit).hooks;
	function emit(event, payload, options) {
		const emittingPayload = {
			...event,
			body: payload
		};
		for (const listener of listeners.get(event.id) || []) {
			listener(emittingPayload, options);
			hooks?.onReceived?.(event.id, emittingPayload);
		}
		for (const onceListener of onceListeners.get(event.id) || []) {
			onceListener(emittingPayload, options);
			hooks?.onReceived?.(event.id, emittingPayload);
			onceListeners.get(event.id)?.delete(onceListener);
		}
		for (const matchExpression of matchExpressions.values()) if (matchExpression.matcher) {
			if (!matchExpression.matcher(emittingPayload)) continue;
			for (const listener of matchExpressionListeners.get(matchExpression.id) || []) {
				listener(emittingPayload, options);
				hooks?.onReceived?.(matchExpression.id, emittingPayload);
			}
			for (const onceListener of matchExpressionOnceListeners.get(matchExpression.id) || []) {
				onceListener(emittingPayload, options);
				hooks?.onReceived?.(matchExpression.id, emittingPayload);
				matchExpressionOnceListeners.get(matchExpression.id)?.delete(onceListener);
			}
		}
		hooks?.onSent(event.id, emittingPayload, options);
	}
	return {
		get listeners() {
			return listeners;
		},
		get onceListeners() {
			return onceListeners;
		},
		emit,
		on(eventOrMatchExpression, handler) {
			if (eventOrMatchExpression.type === EventaType.Event) {
				const event = eventOrMatchExpression;
				if (!listeners.has(event.id)) listeners.set(event.id, /* @__PURE__ */ new Set());
				listeners.get(event.id)?.add(handler);
				return () => listeners.get(event.id)?.delete(handler);
			}
			if (eventOrMatchExpression.type === EventaType.MatchExpression) {
				const matchExpression = eventOrMatchExpression;
				if (!matchExpressions.has(matchExpression.id)) matchExpressions.set(matchExpression.id, matchExpression);
				if (!matchExpressionListeners.has(matchExpression.id)) matchExpressionListeners.set(matchExpression.id, /* @__PURE__ */ new Set());
				matchExpressionListeners.get(matchExpression.id)?.add(handler);
				return () => matchExpressionListeners.get(matchExpression.id)?.delete(handler);
			}
			return () => void 0;
		},
		once(eventOrMatchExpression, handler) {
			if (eventOrMatchExpression.type === EventaType.Event) {
				const event = eventOrMatchExpression;
				if (!onceListeners.has(event.id)) onceListeners.set(event.id, /* @__PURE__ */ new Set());
				onceListeners.get(event.id)?.add(handler);
				return () => onceListeners.get(event.id)?.delete(handler);
			}
			if (eventOrMatchExpression.type === EventaType.MatchExpression) {
				const matchExpression = eventOrMatchExpression;
				if (!matchExpressions.has(matchExpression.id)) matchExpressions.set(matchExpression.id, matchExpression);
				if (!matchExpressionListeners.has(matchExpression.id)) matchExpressionListeners.set(matchExpression.id, /* @__PURE__ */ new Set());
				matchExpressionOnceListeners.get(matchExpression.id)?.add(handler);
				return () => matchExpressionOnceListeners.get(matchExpression.id)?.delete(handler);
			}
			return () => void 0;
		},
		off(eventOrMatchExpression, handler) {
			switch (eventOrMatchExpression.type) {
				case EventaType.Event:
					if (handler !== void 0) {
						listeners.get(eventOrMatchExpression.id)?.delete(handler);
						onceListeners.get(eventOrMatchExpression.id)?.delete(handler);
						break;
					}
					listeners.delete(eventOrMatchExpression.id);
					onceListeners.delete(eventOrMatchExpression.id);
					break;
				case EventaType.MatchExpression:
					if (handler !== void 0) {
						matchExpressionListeners.get(eventOrMatchExpression.id)?.delete(handler);
						matchExpressionOnceListeners.get(eventOrMatchExpression.id)?.delete(handler);
						break;
					}
					matchExpressionListeners.delete(eventOrMatchExpression.id);
					matchExpressionOnceListeners.delete(eventOrMatchExpression.id);
					break;
			}
		}
	};
}

//#endregion
//#region ../../node_modules/.pnpm/@moeru+eventa@1.0.0-alpha.14_electron@39.7.0/node_modules/@moeru/eventa/dist/src-OOE3RB9u.mjs
let InvokeEventType = /* @__PURE__ */ function(InvokeEventType$1) {
	InvokeEventType$1[InvokeEventType$1["SendEvent"] = 0] = "SendEvent";
	InvokeEventType$1[InvokeEventType$1["SendEventError"] = 1] = "SendEventError";
	InvokeEventType$1[InvokeEventType$1["SendEventStreamEnd"] = 2] = "SendEventStreamEnd";
	InvokeEventType$1[InvokeEventType$1["SendEventAbort"] = 3] = "SendEventAbort";
	InvokeEventType$1[InvokeEventType$1["ReceiveEvent"] = 4] = "ReceiveEvent";
	InvokeEventType$1[InvokeEventType$1["ReceiveEventError"] = 5] = "ReceiveEventError";
	InvokeEventType$1[InvokeEventType$1["ReceiveEventStreamEnd"] = 6] = "ReceiveEventStreamEnd";
	return InvokeEventType$1;
}({});
function defineInvokeEventa(tag) {
	if (!tag) tag = nanoid();
	return {
		sendEvent: {
			...defineEventa(`${tag}-send`),
			invokeType: InvokeEventType.SendEvent
		},
		sendEventError: {
			...defineEventa(`${tag}-send-error`),
			invokeType: InvokeEventType.SendEventError
		},
		sendEventStreamEnd: {
			...defineEventa(`${tag}-send-stream-end`),
			invokeType: InvokeEventType.SendEventStreamEnd
		},
		sendEventAbort: {
			...defineEventa(`${tag}-send-abort`),
			invokeType: InvokeEventType.SendEventAbort
		},
		receiveEvent: {
			...defineEventa(`${tag}-receive`),
			invokeType: InvokeEventType.ReceiveEvent
		},
		receiveEventError: {
			...defineEventa(`${tag}-receive-error`),
			invokeType: InvokeEventType.ReceiveEventError
		},
		receiveEventStreamEnd: {
			...defineEventa(`${tag}-receive-stream-end`),
			invokeType: InvokeEventType.ReceiveEventStreamEnd
		}
	};
}
function createAbortError(reason) {
	if (reason instanceof Error && reason.name === "AbortError") return reason;
	if (typeof DOMException !== "undefined") try {
		return new DOMException(reason ? String(reason) : "Aborted", "AbortError");
	} catch {}
	const error = reason instanceof Error ? reason : new Error(reason ? String(reason) : "Aborted");
	error.name = "AbortError";
	return error;
}
/**
* Define a unary invoke handler (server side).
*
* The handler can accept a unary or streaming request; it must return
* a single response (or an extendable response envelope).
*
* @example
* ```ts
* const events = defineInvokeEventa<{ id: string }, { name: string }>()
*
* defineInvokeHandler(serverCtx, events, ({ name }) => ({
*   id: `user-${name}`,
* }))
* ```
*
* @param ctx Event context on the handler/server side.
* @param event Invoke event definition created by `defineInvokeEventa`.
* @param handler Handler that returns a response (or response + metadata).
*/
function defineInvokeHandler(ctx, event, handler) {
	if (!ctx.invokeHandlers) ctx.invokeHandlers = /* @__PURE__ */ new Map();
	let handlers = ctx.invokeHandlers?.get(event.sendEvent.id);
	if (!handlers) {
		handlers = /* @__PURE__ */ new Map();
		ctx.invokeHandlers?.set(event.sendEvent.id, handlers);
	}
	let internalHandler = handlers.get(handler);
	if (!internalHandler) {
		const streamStates = /* @__PURE__ */ new Map();
		const abortControllers = /* @__PURE__ */ new Map();
		const abortReasons = /* @__PURE__ */ new Map();
		const scheduleAbort = (controller, reason) => {
			if (typeof queueMicrotask !== "undefined") {
				queueMicrotask(() => controller.abort(reason));
				return;
			}
			Promise.resolve().then(() => controller.abort(reason));
		};
		const handleInvoke = async (invokeId, payload, options) => {
			const abortController = new AbortController();
			abortControllers.set(invokeId, abortController);
			if (abortReasons.has(invokeId)) scheduleAbort(abortController, abortReasons.get(invokeId));
			const handlerOptions = options ? {
				...options,
				abortController
			} : { abortController };
			try {
				const response = await handler(payload, handlerOptions);
				ctx.emit({
					...defineEventa(`${event.receiveEvent.id}-${invokeId}`),
					invokeType: event.receiveEvent.invokeType
				}, {
					invokeId,
					content: response
				}, options);
			} catch (error) {
				ctx.emit({
					...defineEventa(`${event.receiveEventError.id}-${invokeId}`),
					invokeType: event.receiveEventError.invokeType
				}, {
					invokeId,
					content: { error }
				}, options);
			} finally {
				abortControllers.delete(invokeId);
				abortReasons.delete(invokeId);
			}
		};
		const onSend = async (payload, options) => {
			if (!payload.body) return;
			if (!payload.body.invokeId) return;
			const invokeId = payload.body.invokeId;
			if (payload.body.isReqStream) {
				let controller = streamStates.get(invokeId);
				if (!controller) {
					let localController;
					const reqStream = new ReadableStream({ start(c) {
						localController = c;
					} });
					controller = localController;
					streamStates.set(invokeId, controller);
					handleInvoke(invokeId, reqStream, options);
				}
				controller.enqueue(payload.body.content);
				return;
			}
			handleInvoke(invokeId, payload.body?.content, options);
		};
		const onSendStreamEnd = (payload, options) => {
			if (!payload.body) return;
			if (!payload.body.invokeId) return;
			const invokeId = payload.body.invokeId;
			let controller = streamStates.get(invokeId);
			if (!controller) {
				let localController;
				const reqStream = new ReadableStream({ start(c) {
					localController = c;
				} });
				controller = localController;
				streamStates.set(invokeId, controller);
				handleInvoke(invokeId, reqStream, options);
			}
			controller.close();
			streamStates.delete(invokeId);
		};
		const onSendAbort = (payload, options) => {
			if (!payload.body) return;
			if (!payload.body.invokeId) return;
			const invokeId = payload.body.invokeId;
			const reason = payload.body.content;
			const abortController = abortControllers.get(invokeId);
			if (!abortController) {
				abortReasons.set(invokeId, reason);
				let streamController$1 = streamStates.get(invokeId);
				if (!streamController$1) {
					let localController;
					const reqStream = new ReadableStream({ start(c) {
						localController = c;
					} });
					streamController$1 = localController;
					streamStates.set(invokeId, streamController$1);
					handleInvoke(invokeId, reqStream, options);
				}
				streamController$1.error(createAbortError(reason));
				streamStates.delete(invokeId);
				return;
			}
			scheduleAbort(abortController, reason);
			const streamController = streamStates.get(invokeId);
			if (streamController) {
				streamController.error(createAbortError(reason));
				streamStates.delete(invokeId);
			}
		};
		internalHandler = {
			onSend,
			onSendStreamEnd,
			onSendAbort
		};
		handlers.set(handler, internalHandler);
		ctx.on(event.sendEvent, internalHandler.onSend);
		ctx.on(event.sendEventStreamEnd, internalHandler.onSendStreamEnd);
		ctx.on(event.sendEventAbort, internalHandler.onSendAbort);
	}
	return () => {
		ctx.off(event.sendEvent, internalHandler.onSend);
		ctx.off(event.sendEventStreamEnd, internalHandler.onSendStreamEnd);
		ctx.off(event.sendEventAbort, internalHandler.onSendAbort);
	};
}

//#endregion
//#region ../../node_modules/.pnpm/@moeru+eventa@1.0.0-alpha.14_electron@39.7.0/node_modules/@moeru/eventa/dist/shared-BZOulnwC.mjs
function generatePayload(type, payload) {
	return {
		id: nanoid(),
		type,
		payload
	};
}
function parsePayload(data) {
	return data;
}
const errorEvent = { ...defineEventa() };

//#endregion
//#region ../../node_modules/.pnpm/@moeru+eventa@1.0.0-alpha.14_electron@39.7.0/node_modules/@moeru/eventa/dist/adapters/electron/main.mjs
function withRemoval(ipcMain, type, listener) {
	ipcMain.on(type, listener);
	return { remove: () => {
		ipcMain.off(type, listener);
	} };
}
function createContext(ipcMain, window, options) {
	const ctx = createContext$1();
	const { messageEventName = "eventa-message", errorEventName = "eventa-error", extraListeners = {}, onlySameWindow = false } = options || {};
	const cleanupRemoval = [];
	ctx.on(and(matchBy("*"), matchBy((e) => e._flowDirection === EventaFlowDirection.Outbound || !e._flowDirection)), (event, options$1) => {
		const eventBody = generatePayload(event.id, {
			...defineOutboundEventa(event.type),
			...event
		});
		if (messageEventName !== false) try {
			if (window != null) {
				if (window.isDestroyed()) return;
				if (onlySameWindow) {
					if (window.webContents.id === options$1?.raw.ipcMainEvent.sender.id) window?.webContents?.send(messageEventName, eventBody);
				} else window?.webContents?.send(messageEventName, eventBody);
			} else {
				if (options$1?.raw.ipcMainEvent.sender.isDestroyed()) return;
				options$1?.raw.ipcMainEvent.sender.send(messageEventName, eventBody);
			}
		} catch (error) {
			if (!(error instanceof Error) || error?.message !== "Object has been destroyed") throw error;
		}
	});
	if (messageEventName) cleanupRemoval.push(withRemoval(ipcMain, messageEventName, (ipcMainEvent, event) => {
		try {
			const { type, payload } = parsePayload(event);
			ctx.emit(defineInboundEventa(type), payload.body, { raw: {
				ipcMainEvent,
				event
			} });
		} catch (error) {
			console.error("Failed to parse IpcMain message:", error);
			ctx.emit(errorEvent, { error }, { raw: {
				ipcMainEvent,
				event
			} });
		}
	}));
	if (errorEventName) cleanupRemoval.push(withRemoval(ipcMain, errorEventName, (ipcMainEvent, error) => {
		ctx.emit(errorEvent, { error }, { raw: {
			ipcMainEvent,
			event: error
		} });
	}));
	for (const [eventName, listener] of Object.entries(extraListeners)) cleanupRemoval.push(withRemoval(ipcMain, eventName, listener));
	return {
		context: ctx,
		dispose: () => {
			cleanupRemoval.forEach((removal) => removal.remove());
		}
	};
}

//#endregion
//#region ../../node_modules/.pnpm/async-mutex@0.5.0/node_modules/async-mutex/index.mjs
const E_TIMEOUT = /* @__PURE__ */ new Error("timeout while waiting for mutex to become available");
const E_CANCELED = /* @__PURE__ */ new Error("request for lock canceled");
var __awaiter$2 = function(thisArg, _arguments, P, generator) {
	function adopt(value) {
		return value instanceof P ? value : new P(function(resolve) {
			resolve(value);
		});
	}
	return new (P || (P = Promise))(function(resolve, reject) {
		function fulfilled(value) {
			try {
				step(generator.next(value));
			} catch (e) {
				reject(e);
			}
		}
		function rejected(value) {
			try {
				step(generator["throw"](value));
			} catch (e) {
				reject(e);
			}
		}
		function step(result) {
			result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
		}
		step((generator = generator.apply(thisArg, _arguments || [])).next());
	});
};
var Semaphore = class {
	constructor(_value, _cancelError = E_CANCELED) {
		this._value = _value;
		this._cancelError = _cancelError;
		this._queue = [];
		this._weightedWaiters = [];
	}
	acquire(weight = 1, priority = 0) {
		if (weight <= 0) throw new Error(`invalid weight ${weight}: must be positive`);
		return new Promise((resolve, reject) => {
			const task = {
				resolve,
				reject,
				weight,
				priority
			};
			const i = findIndexFromEnd(this._queue, (other) => priority <= other.priority);
			if (i === -1 && weight <= this._value) this._dispatchItem(task);
			else this._queue.splice(i + 1, 0, task);
		});
	}
	runExclusive(callback_1) {
		return __awaiter$2(this, arguments, void 0, function* (callback, weight = 1, priority = 0) {
			const [value, release] = yield this.acquire(weight, priority);
			try {
				return yield callback(value);
			} finally {
				release();
			}
		});
	}
	waitForUnlock(weight = 1, priority = 0) {
		if (weight <= 0) throw new Error(`invalid weight ${weight}: must be positive`);
		if (this._couldLockImmediately(weight, priority)) return Promise.resolve();
		else return new Promise((resolve) => {
			if (!this._weightedWaiters[weight - 1]) this._weightedWaiters[weight - 1] = [];
			insertSorted(this._weightedWaiters[weight - 1], {
				resolve,
				priority
			});
		});
	}
	isLocked() {
		return this._value <= 0;
	}
	getValue() {
		return this._value;
	}
	setValue(value) {
		this._value = value;
		this._dispatchQueue();
	}
	release(weight = 1) {
		if (weight <= 0) throw new Error(`invalid weight ${weight}: must be positive`);
		this._value += weight;
		this._dispatchQueue();
	}
	cancel() {
		this._queue.forEach((entry) => entry.reject(this._cancelError));
		this._queue = [];
	}
	_dispatchQueue() {
		this._drainUnlockWaiters();
		while (this._queue.length > 0 && this._queue[0].weight <= this._value) {
			this._dispatchItem(this._queue.shift());
			this._drainUnlockWaiters();
		}
	}
	_dispatchItem(item) {
		const previousValue = this._value;
		this._value -= item.weight;
		item.resolve([previousValue, this._newReleaser(item.weight)]);
	}
	_newReleaser(weight) {
		let called = false;
		return () => {
			if (called) return;
			called = true;
			this.release(weight);
		};
	}
	_drainUnlockWaiters() {
		if (this._queue.length === 0) for (let weight = this._value; weight > 0; weight--) {
			const waiters = this._weightedWaiters[weight - 1];
			if (!waiters) continue;
			waiters.forEach((waiter) => waiter.resolve());
			this._weightedWaiters[weight - 1] = [];
		}
		else {
			const queuedPriority = this._queue[0].priority;
			for (let weight = this._value; weight > 0; weight--) {
				const waiters = this._weightedWaiters[weight - 1];
				if (!waiters) continue;
				const i = waiters.findIndex((waiter) => waiter.priority <= queuedPriority);
				(i === -1 ? waiters : waiters.splice(0, i)).forEach(((waiter) => waiter.resolve()));
			}
		}
	}
	_couldLockImmediately(weight, priority) {
		return (this._queue.length === 0 || this._queue[0].priority < priority) && weight <= this._value;
	}
};
function insertSorted(a, v) {
	const i = findIndexFromEnd(a, (other) => v.priority <= other.priority);
	a.splice(i + 1, 0, v);
}
function findIndexFromEnd(a, predicate) {
	for (let i = a.length - 1; i >= 0; i--) if (predicate(a[i])) return i;
	return -1;
}
var __awaiter$1 = function(thisArg, _arguments, P, generator) {
	function adopt(value) {
		return value instanceof P ? value : new P(function(resolve) {
			resolve(value);
		});
	}
	return new (P || (P = Promise))(function(resolve, reject) {
		function fulfilled(value) {
			try {
				step(generator.next(value));
			} catch (e) {
				reject(e);
			}
		}
		function rejected(value) {
			try {
				step(generator["throw"](value));
			} catch (e) {
				reject(e);
			}
		}
		function step(result) {
			result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
		}
		step((generator = generator.apply(thisArg, _arguments || [])).next());
	});
};
var Mutex = class {
	constructor(cancelError) {
		this._semaphore = new Semaphore(1, cancelError);
	}
	acquire() {
		return __awaiter$1(this, arguments, void 0, function* (priority = 0) {
			const [, releaser] = yield this._semaphore.acquire(1, priority);
			return releaser;
		});
	}
	runExclusive(callback, priority = 0) {
		return this._semaphore.runExclusive(() => callback(), 1, priority);
	}
	isLocked() {
		return this._semaphore.isLocked();
	}
	waitForUnlock(priority = 0) {
		return this._semaphore.waitForUnlock(1, priority);
	}
	release() {
		if (this._semaphore.isLocked()) this._semaphore.release();
	}
	cancel() {
		return this._semaphore.cancel();
	}
};
var __awaiter = function(thisArg, _arguments, P, generator) {
	function adopt(value) {
		return value instanceof P ? value : new P(function(resolve) {
			resolve(value);
		});
	}
	return new (P || (P = Promise))(function(resolve, reject) {
		function fulfilled(value) {
			try {
				step(generator.next(value));
			} catch (e) {
				reject(e);
			}
		}
		function rejected(value) {
			try {
				step(generator["throw"](value));
			} catch (e) {
				reject(e);
			}
		}
		function step(result) {
			result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
		}
		step((generator = generator.apply(thisArg, _arguments || [])).next());
	});
};
function withTimeout(sync, timeout, timeoutError = E_TIMEOUT) {
	return {
		acquire: (weightOrPriority, priority) => {
			let weight;
			if (isSemaphore(sync)) weight = weightOrPriority;
			else {
				weight = void 0;
				priority = weightOrPriority;
			}
			if (weight !== void 0 && weight <= 0) throw new Error(`invalid weight ${weight}: must be positive`);
			return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
				let isTimeout = false;
				const handle = setTimeout(() => {
					isTimeout = true;
					reject(timeoutError);
				}, timeout);
				try {
					const ticket = yield isSemaphore(sync) ? sync.acquire(weight, priority) : sync.acquire(priority);
					if (isTimeout) (Array.isArray(ticket) ? ticket[1] : ticket)();
					else {
						clearTimeout(handle);
						resolve(ticket);
					}
				} catch (e) {
					if (!isTimeout) {
						clearTimeout(handle);
						reject(e);
					}
				}
			}));
		},
		runExclusive(callback, weight, priority) {
			return __awaiter(this, void 0, void 0, function* () {
				let release = () => void 0;
				try {
					const ticket = yield this.acquire(weight, priority);
					if (Array.isArray(ticket)) {
						release = ticket[1];
						return yield callback(ticket[0]);
					} else {
						release = ticket;
						return yield callback();
					}
				} finally {
					release();
				}
			});
		},
		release(weight) {
			sync.release(weight);
		},
		cancel() {
			return sync.cancel();
		},
		waitForUnlock: (weightOrPriority, priority) => {
			let weight;
			if (isSemaphore(sync)) weight = weightOrPriority;
			else {
				weight = void 0;
				priority = weightOrPriority;
			}
			if (weight !== void 0 && weight <= 0) throw new Error(`invalid weight ${weight}: must be positive`);
			return new Promise((resolve, reject) => {
				const handle = setTimeout(() => reject(timeoutError), timeout);
				(isSemaphore(sync) ? sync.waitForUnlock(weight, priority) : sync.waitForUnlock(priority)).then(() => {
					clearTimeout(handle);
					resolve();
				});
			});
		},
		isLocked: () => sync.isLocked(),
		getValue: () => sync.getValue(),
		setValue: (value) => sync.setValue(value)
	};
}
function isSemaphore(sync) {
	return sync.getValue !== void 0;
}

//#endregion
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
//#region src/main/utils.ts
/**
* Serializes a DesktopCapturerSource to a format that can be sent over IPC.
*
* Using Uint8Array for appIcon and thumbnail here instead of transferable objects
* or SharedArrayBuffer due to Electron limitations.
*
* See:
* - {@link https://github.com/electron/electron/issues/27024}
* - {@link https://github.com/electron/electron/issues/34905}
*
* @param source - The DesktopCapturerSource to serialize
* @returns A serializable representation of the DesktopCapturerSource
*/
function toSerializableDesktopCapturerSource(source) {
	return {
		id: source.id,
		name: source.name,
		display_id: source.display_id,
		appIcon: source.appIcon != null && !source.appIcon.isEmpty() ? new Uint8Array(source.appIcon.toPNG().buffer) : void 0,
		thumbnail: source.thumbnail != null ? new Uint8Array(source.thumbnail.toJPEG(90).buffer) : void 0
	};
}
function checkMacOSScreenCapturePermission() {
	if (!isMacOS) throw new Error("checkMacOSScreenCapturePermission is only available on macOS (darwin)");
	return systemPreferences.getMediaAccessStatus("screen");
}
function requestMacOSScreenCapturePermission() {
	if (!isMacOS) throw new Error("requestMacOSScreenCapturePermission is only available on macOS (darwin)");
	shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
}

//#endregion
//#region src/main/index.ts
const defaultSourcesOptions = { types: ["screen"] };
const featureSwitchKey = "enable-features";
let LoopbackAudioTypes = /* @__PURE__ */ function(LoopbackAudioTypes) {
	LoopbackAudioTypes["Loopback"] = "loopback";
	LoopbackAudioTypes["LoopbackWithMute"] = "loopbackWithMute";
	return LoopbackAudioTypes;
}({});
var DefaultFeatureFlags = /* @__PURE__ */ function(DefaultFeatureFlags) {
	DefaultFeatureFlags["PulseaudioLoopbackForScreenShare"] = "PulseaudioLoopbackForScreenShare";
	/**
	* Note(Makito): Some discussions on this flag can be found here:
	*
	* - {@link https://issues.chromium.org/issues/355308245}
	* - {@link https://issues.chromium.org/issues/394329567}
	*/
	DefaultFeatureFlags["MacLoopbackAudioForScreenShare"] = "MacLoopbackAudioForScreenShare";
	return DefaultFeatureFlags;
}(DefaultFeatureFlags || {});
var CoreAudioTapFeatureFlags = /* @__PURE__ */ function(CoreAudioTapFeatureFlags) {
	CoreAudioTapFeatureFlags["MacCoreAudioTapSystemAudioLoopbackOverride"] = "MacCatapSystemAudioLoopbackCapture";
	return CoreAudioTapFeatureFlags;
}(CoreAudioTapFeatureFlags || {});
var ScreenCaptureKitFeatureFlags = /* @__PURE__ */ function(ScreenCaptureKitFeatureFlags) {
	ScreenCaptureKitFeatureFlags["MacScreenCaptureKitSystemAudioLoopbackOverride"] = "MacSckSystemAudioLoopbackOverride";
	return ScreenCaptureKitFeatureFlags;
}(ScreenCaptureKitFeatureFlags || {});
function buildFeatureFlags({ otherEnabledFeatures, forceCoreAudioTap }) {
	const featureFlags = [...Object.values(DefaultFeatureFlags), ...otherEnabledFeatures ?? []];
	if (forceCoreAudioTap) featureFlags.push(CoreAudioTapFeatureFlags.MacCoreAudioTapSystemAudioLoopbackOverride);
	else featureFlags.push(ScreenCaptureKitFeatureFlags.MacScreenCaptureKitSystemAudioLoopbackOverride);
	return featureFlags.join(",");
}
let initMainCalled = false;
let setSourceMutex;
let screenCaptureSourceMutexHandle;
let setSourceMutexTimeoutHandle;
function initScreenCaptureForMain(options = {}) {
	const { forceCoreAudioTap = false, mutexAcquireTimeout = 5e3 } = options;
	let log = useLogg("screen-capture").useGlobalConfig();
	if (options?.loggerOptions?.logLevel) log = log.withLogLevelString(options?.loggerOptions?.logLevel ?? "info");
	if (options?.loggerOptions?.format) log = log.withFormat(options?.loggerOptions?.format ?? "plain");
	if (mutexAcquireTimeout <= 0 || !Number.isFinite(mutexAcquireTimeout) || Number.isNaN(mutexAcquireTimeout)) throw new Error("mutexAcquireTimeout must be a positive finite number");
	if (initMainCalled) {
		log.warn("initScreenCaptureForMain should only be called once");
		return;
	}
	initMainCalled = true;
	setSourceMutex = withTimeout(new Mutex(), mutexAcquireTimeout);
	const otherEnabledFeatures = app.commandLine.getSwitchValue(featureSwitchKey)?.split(",");
	if (app.commandLine.hasSwitch(featureSwitchKey)) app.commandLine.removeSwitch(featureSwitchKey);
	const currentFeatureFlags = buildFeatureFlags({
		otherEnabledFeatures,
		forceCoreAudioTap
	});
	app.commandLine.appendSwitch(featureSwitchKey, currentFeatureFlags);
}
function resetScreenCaptureSource() {
	session.defaultSession.setDisplayMediaRequestHandler(null);
	clearTimeout(setSourceMutexTimeoutHandle);
	setSourceMutexTimeoutHandle = void 0;
	screenCaptureSourceMutexHandle = void 0;
}
const initializedWindows = /* @__PURE__ */ new WeakSet();
function tryWindowTitle(window, previous) {
	if (window.isDestroyed()) return previous || "<destroyed>";
	return window.getTitle();
}
function initScreenCaptureForWindow(window, options) {
	let log = useLogg("screen-capture").useGlobalConfig();
	if (options?.loggerOptions?.logLevel) log = log.withLogLevelString(options?.loggerOptions?.logLevel ?? "info");
	if (options?.loggerOptions?.format) log = log.withFormat(options?.loggerOptions?.format ?? "plain");
	const windowId = window.id;
	const windowTitle = tryWindowTitle(window);
	log.withFields({
		windowId,
		windowTitle: tryWindowTitle(window, windowTitle)
	}).debug(`init for window`);
	if (!initMainCalled) throw new Error("initScreenCaptureForMain must be called before calling initScreenCaptureForWindow");
	if (initializedWindows.has(window)) {
		log.withFields({
			windowId,
			windowTitle: tryWindowTitle(window, windowTitle)
		}).warn("initScreenCaptureForWindow should only be called once per window");
		return;
	}
	initializedWindows.add(window);
	const { context } = createContext(ipcMain, window, { onlySameWindow: true });
	const session$1 = session.defaultSession;
	defineInvokeHandler(context, screenCapture.checkMacOSPermission, async () => checkMacOSScreenCapturePermission());
	defineInvokeHandler(context, screenCapture.requestMacOSPermission, async () => requestMacOSScreenCapturePermission());
	defineInvokeHandler(context, screenCapture.getSources, async (sourcesOptions) => {
		return (await desktopCapturer.getSources(sourcesOptions)).map((source) => toSerializableDesktopCapturerSource(source));
	});
	defineInvokeHandler(context, screenCapture.setSource, async (request, eventaOptions) => {
		if (window.webContents.id !== eventaOptions?.raw.ipcMainEvent.sender.id) return;
		const { timeout } = request;
		if (typeof timeout === "number" && (timeout <= 0 || !Number.isFinite(timeout) || Number.isNaN(timeout))) throw new Error("timeout must be a positive finite number");
		await setSourceMutex.acquire();
		log.withFields({
			windowId,
			windowTitle: tryWindowTitle(window, windowTitle)
		}).debug("setSourceMutex acquired");
		clearTimeout(setSourceMutexTimeoutHandle);
		const handle = nanoid$1();
		setSourceMutexTimeoutHandle = void 0;
		screenCaptureSourceMutexHandle = handle;
		try {
			session$1.setDisplayMediaRequestHandler(async (_request, callback) => {
				const source = (await desktopCapturer.getSources(request.options)).find((source) => source.id === request.sourceId);
				if (!source) throw new Error(`Source with id ${request.sourceId} not found.`);
				callback({
					video: source,
					audio: options?.loopbackWithMute ? LoopbackAudioTypes.LoopbackWithMute : LoopbackAudioTypes.Loopback
				});
			});
			setSourceMutexTimeoutHandle = setTimeout(() => {
				if (screenCaptureSourceMutexHandle !== handle) return;
				resetScreenCaptureSource();
				setSourceMutex.release();
				log.withFields({
					windowId,
					windowTitle: tryWindowTitle(window, windowTitle)
				}).warn("setSourceMutex released for window due to timeout. Please make sure to invoke screenCaptureResetSource when getDisplayMedia is completed.");
			}, timeout ?? 5e3);
			return handle;
		} catch (e) {
			log.withFields({
				windowId,
				windowTitle: tryWindowTitle(window, windowTitle)
			}).withError(e).error("screenCaptureSetSourceEx failed for window");
			resetScreenCaptureSource();
			setSourceMutex.release();
			throw e;
		}
	});
	defineInvokeHandler(context, screenCapture.resetSource, async (mutexHandle) => {
		if (screenCaptureSourceMutexHandle !== mutexHandle) return;
		resetScreenCaptureSource();
		setSourceMutex.release();
		log.withFields({
			windowId,
			windowTitle: tryWindowTitle(window, windowTitle)
		}).debug("setSourceMutex released by window");
	});
}

//#endregion
export { LoopbackAudioTypes, buildFeatureFlags, defaultSourcesOptions, featureSwitchKey, initScreenCaptureForMain, initScreenCaptureForWindow };