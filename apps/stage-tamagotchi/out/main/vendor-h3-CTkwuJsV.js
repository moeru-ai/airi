import http from "node:http";
import { PassThrough, Readable } from "node:stream";
import nodeHTTPS from "node:https";
import nodeHTTP2 from "node:http2";
var NullProtoObj = /* @__PURE__ */ (() => {
	const e = function() {};
	return e.prototype = Object.create(null), Object.freeze(e.prototype), e;
})();
/**
* Create a new router context.
*/
function createRouter() {
	return {
		root: { key: "" },
		static: new NullProtoObj()
	};
}
function splitPath(path) {
	const [_, ...s] = path.split("/");
	return s[s.length - 1] === "" ? s.slice(0, -1) : s;
}
function getMatchParams(segments, paramsMap) {
	const params = new NullProtoObj();
	for (const [index, name] of paramsMap) {
		const segment = index < 0 ? segments.slice(-(index + 1)).join("/") : segments[index];
		if (typeof name === "string") params[name] = segment;
		else {
			const match = segment.match(name);
			if (match) for (const key in match.groups) params[key] = match.groups[key];
		}
	}
	return params;
}
/**
* Add a route to the router context.
*/
function addRoute(ctx, method = "", path, data) {
	method = method.toUpperCase();
	if (path.charCodeAt(0) !== 47) path = `/${path}`;
	path = path.replace(/\\:/g, "%3A");
	const segments = splitPath(path);
	let node = ctx.root;
	let _unnamedParamIndex = 0;
	const paramsMap = [];
	const paramsRegexp = [];
	for (let i = 0; i < segments.length; i++) {
		let segment = segments[i];
		if (segment.startsWith("**")) {
			if (!node.wildcard) node.wildcard = { key: "**" };
			node = node.wildcard;
			paramsMap.push([
				-(i + 1),
				segment.split(":")[1] || "_",
				segment.length === 2
			]);
			break;
		}
		if (segment === "*" || segment.includes(":")) {
			if (!node.param) node.param = { key: "*" };
			node = node.param;
			if (segment === "*") paramsMap.push([
				i,
				`_${_unnamedParamIndex++}`,
				true
			]);
			else if (segment.includes(":", 1)) {
				const regexp = getParamRegexp(segment);
				paramsRegexp[i] = regexp;
				node.hasRegexParam = true;
				paramsMap.push([
					i,
					regexp,
					false
				]);
			} else paramsMap.push([
				i,
				segment.slice(1),
				false
			]);
			continue;
		}
		if (segment === "\\*") segment = segments[i] = "*";
		else if (segment === "\\*\\*") segment = segments[i] = "**";
		const child = node.static?.[segment];
		if (child) node = child;
		else {
			const staticNode = { key: segment };
			if (!node.static) node.static = new NullProtoObj();
			node.static[segment] = staticNode;
			node = staticNode;
		}
	}
	const hasParams = paramsMap.length > 0;
	if (!node.methods) node.methods = new NullProtoObj();
	node.methods[method] ??= [];
	node.methods[method].push({
		data: data || null,
		paramsRegexp,
		paramsMap: hasParams ? paramsMap : void 0
	});
	if (!hasParams) ctx.static["/" + segments.join("/")] = node;
}
function getParamRegexp(segment) {
	const regex = segment.replace(/:(\w+)/g, (_, id) => `(?<${id}>[^/]+)`).replace(/\./g, "\\.");
	return /* @__PURE__ */ new RegExp(`^${regex}$`);
}
/**
* Find a route by path.
*/
function findRoute(ctx, method = "", path, opts) {
	if (path.charCodeAt(path.length - 1) === 47) path = path.slice(0, -1);
	const staticNode = ctx.static[path];
	if (staticNode && staticNode.methods) {
		const staticMatch = staticNode.methods[method] || staticNode.methods[""];
		if (staticMatch !== void 0) return staticMatch[0];
	}
	const segments = splitPath(path);
	const match = _lookupTree(ctx, ctx.root, method, segments, 0)?.[0];
	if (match === void 0) return;
	if (opts?.params === false) return match;
	return {
		data: match.data,
		params: match.paramsMap ? getMatchParams(segments, match.paramsMap) : void 0
	};
}
function _lookupTree(ctx, node, method, segments, index) {
	if (index === segments.length) {
		if (node.methods) {
			const match = node.methods[method] || node.methods[""];
			if (match) return match;
		}
		if (node.param && node.param.methods) {
			const match = node.param.methods[method] || node.param.methods[""];
			if (match) {
				const pMap = match[0].paramsMap;
				if (pMap?.[pMap?.length - 1]?.[2]) return match;
			}
		}
		if (node.wildcard && node.wildcard.methods) {
			const match = node.wildcard.methods[method] || node.wildcard.methods[""];
			if (match) {
				const pMap = match[0].paramsMap;
				if (pMap?.[pMap?.length - 1]?.[2]) return match;
			}
		}
		return;
	}
	const segment = segments[index];
	if (node.static) {
		const staticChild = node.static[segment];
		if (staticChild) {
			const match = _lookupTree(ctx, staticChild, method, segments, index + 1);
			if (match) return match;
		}
	}
	if (node.param) {
		const match = _lookupTree(ctx, node.param, method, segments, index + 1);
		if (match) {
			if (node.param.hasRegexParam) {
				const exactMatch = match.find((m) => m.paramsRegexp[index]?.test(segment)) || match.find((m) => !m.paramsRegexp[index]);
				return exactMatch ? [exactMatch] : void 0;
			}
			return match;
		}
	}
	if (node.wildcard && node.wildcard.methods) return node.wildcard.methods[method] || node.wildcard.methods[""];
}
function routeToRegExp(route = "/") {
	const reSegments = [];
	let idCtr = 0;
	for (const segment of route.split("/")) {
		if (!segment) continue;
		if (segment === "*") reSegments.push(`(?<_${idCtr++}>[^/]*)`);
		else if (segment.startsWith("**")) reSegments.push(segment === "**" ? "?(?<_>.*)" : `?(?<${segment.slice(3)}>.+)`);
		else if (segment.includes(":")) reSegments.push(segment.replace(/:(\w+)/g, (_, id) => `(?<${id}>[^/]+)`).replace(/\./g, "\\."));
		else reSegments.push(segment);
	}
	return /* @__PURE__ */ new RegExp(`^/${reSegments.join("/")}/?$`);
}
var noColor = /* @__PURE__ */ (() => {
	const env = globalThis.process.env ?? {};
	return env.NO_COLOR === "1" || env.TERM === "dumb";
})();
var _c = (c, r = 39) => (t) => noColor ? t : `\u001B[${c}m${t}\u001B[${r}m`;
var bold = /* @__PURE__ */ _c(1, 22);
var red = /* @__PURE__ */ _c(31);
var green = /* @__PURE__ */ _c(32);
var gray = /* @__PURE__ */ _c(90);
function lazyInherit(target, source, sourceKey) {
	for (const key of [...Object.getOwnPropertyNames(source), ...Object.getOwnPropertySymbols(source)]) {
		if (key === "constructor") continue;
		const targetDesc = Object.getOwnPropertyDescriptor(target, key);
		const desc = Object.getOwnPropertyDescriptor(source, key);
		let modified = false;
		if (desc.get) {
			modified = true;
			desc.get = targetDesc?.get || function() {
				return this[sourceKey][key];
			};
		}
		if (desc.set) {
			modified = true;
			desc.set = targetDesc?.set || function(value) {
				this[sourceKey][key] = value;
			};
		}
		if (!targetDesc?.value && typeof desc.value === "function") {
			modified = true;
			desc.value = function(...args) {
				return this[sourceKey][key](...args);
			};
		}
		if (modified) Object.defineProperty(target, key, desc);
	}
}
/**
* URL wrapper with fast paths to access to the following props:
*
*  - `url.pathname`
*  - `url.search`
*  - `url.searchParams`
*  - `url.protocol`
*
* **NOTES:**
*
* - It is assumed that the input URL is **already encoded** and formatted from an HTTP request and contains no hash.
* - Triggering the setters or getters on other props will deoptimize to full URL parsing.
* - Changes to `searchParams` will be discarded as we don't track them.
*/
var FastURL = /* @__PURE__ */ (() => {
	const NativeURL = globalThis.URL;
	const FastURL = class URL {
		#url;
		#href;
		#protocol;
		#host;
		#pathname;
		#search;
		#searchParams;
		#pos;
		constructor(url) {
			if (typeof url === "string") this.#href = url;
			else {
				this.#protocol = url.protocol;
				this.#host = url.host;
				this.#pathname = url.pathname;
				this.#search = url.search;
			}
		}
		static [Symbol.hasInstance](val) {
			return val instanceof NativeURL;
		}
		get _url() {
			if (this.#url) return this.#url;
			this.#url = new NativeURL(this.href);
			this.#href = void 0;
			this.#protocol = void 0;
			this.#host = void 0;
			this.#pathname = void 0;
			this.#search = void 0;
			this.#searchParams = void 0;
			this.#pos = void 0;
			return this.#url;
		}
		get href() {
			if (this.#url) return this.#url.href;
			if (!this.#href) this.#href = `${this.#protocol || "http:"}//${this.#host || "localhost"}${this.#pathname || "/"}${this.#search || ""}`;
			return this.#href;
		}
		#getPos() {
			if (!this.#pos) {
				const url = this.href;
				const protoIndex = url.indexOf("://");
				const pathnameIndex = protoIndex === -1 ? -1 : url.indexOf("/", protoIndex + 4);
				this.#pos = [
					protoIndex,
					pathnameIndex,
					pathnameIndex === -1 ? -1 : url.indexOf("?", pathnameIndex)
				];
			}
			return this.#pos;
		}
		get pathname() {
			if (this.#url) return this.#url.pathname;
			if (this.#pathname === void 0) {
				const [, pathnameIndex, queryIndex] = this.#getPos();
				if (pathnameIndex === -1) return this._url.pathname;
				this.#pathname = this.href.slice(pathnameIndex, queryIndex === -1 ? void 0 : queryIndex);
			}
			return this.#pathname;
		}
		get search() {
			if (this.#url) return this.#url.search;
			if (this.#search === void 0) {
				const [, pathnameIndex, queryIndex] = this.#getPos();
				if (pathnameIndex === -1) return this._url.search;
				const url = this.href;
				this.#search = queryIndex === -1 || queryIndex === url.length - 1 ? "" : url.slice(queryIndex);
			}
			return this.#search;
		}
		get searchParams() {
			if (this.#url) return this.#url.searchParams;
			if (!this.#searchParams) this.#searchParams = new URLSearchParams(this.search);
			return this.#searchParams;
		}
		get protocol() {
			if (this.#url) return this.#url.protocol;
			if (this.#protocol === void 0) {
				const [protocolIndex] = this.#getPos();
				if (protocolIndex === -1) return this._url.protocol;
				this.#protocol = this.href.slice(0, protocolIndex + 1);
			}
			return this.#protocol;
		}
		toString() {
			return this.href;
		}
		toJSON() {
			return this.href;
		}
	};
	lazyInherit(FastURL.prototype, NativeURL.prototype, "_url");
	Object.setPrototypeOf(FastURL.prototype, NativeURL.prototype);
	Object.setPrototypeOf(FastURL, NativeURL);
	return FastURL;
})();
function resolvePortAndHost(opts) {
	const _port = opts.port ?? globalThis.process.env.PORT ?? 3e3;
	const port = typeof _port === "number" ? _port : Number.parseInt(_port, 10);
	if (port < 0 || port > 65535) throw new RangeError(`Port must be between 0 and 65535 (got "${port}").`);
	return {
		port,
		hostname: opts.hostname ?? globalThis.process.env.HOST
	};
}
function fmtURL(host, port, secure) {
	if (!host || !port) return;
	if (host.includes(":")) host = `[${host}]`;
	return `http${secure ? "s" : ""}://${host}:${port}/`;
}
function printListening(opts, url) {
	if (!url || (opts.silent ?? globalThis.process.env?.TEST)) return;
	let additionalInfo = "";
	try {
		const _url = new URL(url);
		if (_url.hostname === "[::]" || _url.hostname === "0.0.0.0") {
			_url.hostname = "localhost";
			url = _url.href;
			additionalInfo = " (all interfaces)";
		}
	} catch {}
	let listeningOn = `➜ Listening on:`;
	if (globalThis.process.stdout?.isTTY) {
		listeningOn = `\u001B[32m${listeningOn}\u001B[0m`;
		url = `\u001B[36m${url}\u001B[0m`;
		additionalInfo = `\u001B[2m${additionalInfo}\u001B[0m`;
	}
	console.log(`${listeningOn} ${url}${additionalInfo}`);
}
function resolveTLSOptions(opts) {
	if (!opts.tls || opts.protocol === "http") return;
	const cert = resolveCertOrKey(opts.tls.cert);
	const key = resolveCertOrKey(opts.tls.key);
	if (!cert && !key) {
		if (opts.protocol === "https") throw new TypeError("TLS `cert` and `key` must be provided for `https` protocol.");
		return;
	}
	if (!cert || !key) throw new TypeError("TLS `cert` and `key` must be provided together.");
	return {
		cert,
		key,
		passphrase: opts.tls.passphrase
	};
}
function resolveCertOrKey(value) {
	if (!value) return;
	if (typeof value !== "string") throw new TypeError("TLS certificate and key must be strings in PEM format or file paths.");
	if (value.startsWith("-----BEGIN ")) return value;
	const { readFileSync } = process.getBuiltinModule("node:fs");
	return readFileSync(value, "utf8");
}
function createWaitUntil() {
	const promises = /* @__PURE__ */ new Set();
	return {
		waitUntil: (promise) => {
			if (typeof promise?.then !== "function") return;
			promises.add(Promise.resolve(promise).catch(console.error).finally(() => {
				promises.delete(promise);
			}));
		},
		wait: () => {
			return Promise.all(promises);
		}
	};
}
function wrapFetch(server) {
	const fetchHandler = server.options.fetch;
	const middleware = server.options.middleware || [];
	return middleware.length === 0 ? fetchHandler : (request) => callMiddleware$1(request, fetchHandler, middleware, 0);
}
function callMiddleware$1(request, fetchHandler, middleware, index) {
	if (index === middleware.length) return fetchHandler(request);
	return middleware[index](request, () => callMiddleware$1(request, fetchHandler, middleware, index + 1));
}
var errorPlugin = (server) => {
	const errorHandler = server.options.error;
	if (!errorHandler) return;
	server.options.middleware.unshift((_req, next) => {
		try {
			const res = next();
			return res instanceof Promise ? res.catch((error) => errorHandler(error)) : res;
		} catch (error) {
			return errorHandler(error);
		}
	});
};
var gracefulShutdownPlugin = (server) => {
	const config = server.options?.gracefulShutdown;
	if (!globalThis.process?.on || config === false || config === void 0 && (process.env.CI || process.env.TEST)) return;
	const gracefulTimeout = config === true || !config?.gracefulTimeout ? Number.parseInt(process.env.SERVER_SHUTDOWN_TIMEOUT || "") || 5 : config.gracefulTimeout;
	let isClosing = false;
	let isClosed = false;
	const w = server.options.silent ? () => {} : process.stderr.write.bind(process.stderr);
	const forceClose = async () => {
		if (isClosed) return;
		w(red("\x1B[2K\rForcibly closing connections...\n"));
		isClosed = true;
		await server.close(true);
	};
	const shutdown = async () => {
		if (isClosing || isClosed) return;
		setTimeout(() => {
			globalThis.process.once("SIGINT", forceClose);
		}, 100);
		isClosing = true;
		const closePromise = server.close();
		for (let remaining = gracefulTimeout; remaining > 0; remaining--) {
			w(gray(`\rStopping server gracefully (${remaining}s)... Press ${bold("Ctrl+C")} again to force close.`));
			if (await Promise.race([closePromise.then(() => true), new Promise((r) => setTimeout(() => r(false), 1e3))])) {
				w("\x1B[2K\r" + green("Server closed successfully.\n"));
				isClosed = true;
				return;
			}
		}
		w("\x1B[2K\rGraceful shutdown timed out.\n");
		await forceClose();
	};
	for (const sig of ["SIGINT", "SIGTERM"]) globalThis.process.on(sig, shutdown);
};
async function sendNodeResponse(nodeRes, webRes) {
	if (!webRes) {
		nodeRes.statusCode = 500;
		return endNodeResponse(nodeRes);
	}
	if (webRes._toNodeResponse) {
		const res = webRes._toNodeResponse();
		writeHead(nodeRes, res.status, res.statusText, res.headers);
		if (res.body) {
			if (res.body instanceof ReadableStream) return streamBody(res.body, nodeRes);
			else if (typeof res.body?.pipe === "function") {
				res.body.pipe(nodeRes);
				return new Promise((resolve) => nodeRes.on("close", resolve));
			}
			nodeRes.write(res.body);
		}
		return endNodeResponse(nodeRes);
	}
	const rawHeaders = [...webRes.headers];
	writeHead(nodeRes, webRes.status, webRes.statusText, rawHeaders);
	return webRes.body ? streamBody(webRes.body, nodeRes) : endNodeResponse(nodeRes);
}
function writeHead(nodeRes, status, statusText, rawHeaders) {
	const writeHeaders = globalThis.Deno ? rawHeaders : rawHeaders.flat();
	if (!nodeRes.headersSent) if (nodeRes.req?.httpVersion === "2.0") nodeRes.writeHead(status, writeHeaders);
	else nodeRes.writeHead(status, statusText, writeHeaders);
}
function endNodeResponse(nodeRes) {
	return new Promise((resolve) => nodeRes.end(resolve));
}
function streamBody(stream, nodeRes) {
	if (nodeRes.destroyed) {
		stream.cancel();
		return;
	}
	const reader = stream.getReader();
	function streamCancel(error) {
		reader.cancel(error).catch(() => {});
		if (error) nodeRes.destroy(error);
	}
	function streamHandle({ done, value }) {
		try {
			if (done) nodeRes.end();
			else if (nodeRes.write(value)) reader.read().then(streamHandle, streamCancel);
			else nodeRes.once("drain", () => reader.read().then(streamHandle, streamCancel));
		} catch (error) {
			streamCancel(error instanceof Error ? error : void 0);
		}
	}
	nodeRes.on("close", streamCancel);
	nodeRes.on("error", streamCancel);
	reader.read().then(streamHandle, streamCancel);
	return reader.closed.catch(streamCancel).finally(() => {
		nodeRes.off("close", streamCancel);
		nodeRes.off("error", streamCancel);
	});
}
/**
* Validates an HTTP Host header value (domain, IPv4, or bracketed IPv6) with optional port.
* Intended for preliminary filtering invalid values like "localhost:3000/foobar?"
*/
var HOST_RE = /^(\[(?:[A-Fa-f0-9:.]+)\]|(?:[A-Za-z0-9_-]+\.)*[A-Za-z0-9_-]+|(?:\d{1,3}\.){3}\d{1,3})(:\d{1,5})?$/;
var NodeRequestURL = class extends FastURL {
	#req;
	constructor({ req }) {
		const path = req.url || "/";
		if (path[0] === "/") {
			const qIndex = path.indexOf("?");
			const pathname = qIndex === -1 ? path : path?.slice(0, qIndex) || "/";
			const search = qIndex === -1 ? "" : path?.slice(qIndex) || "";
			let host = req.headers.host || req.headers[":authority"];
			if (host) {
				if (!HOST_RE.test(host)) throw new TypeError(`Invalid host header: ${host}`);
			} else if (req.socket) host = `${req.socket.localFamily === "IPv6" ? "[" + req.socket.localAddress + "]" : req.socket.localAddress}:${req.socket?.localPort || "80"}`;
			else host = "localhost";
			const protocol = req.socket?.encrypted || req.headers["x-forwarded-proto"] === "https" || req.headers[":scheme"] === "https" ? "https:" : "http:";
			super({
				protocol,
				host,
				pathname,
				search
			});
		} else super(path);
		this.#req = req;
	}
	get pathname() {
		return super.pathname;
	}
	set pathname(value) {
		this._url.pathname = value;
		this.#req.url = this._url.pathname + this._url.search;
	}
};
var NodeRequestHeaders = /* @__PURE__ */ (() => {
	const NativeHeaders = globalThis.Headers;
	class Headers {
		#req;
		#headers;
		constructor(req) {
			this.#req = req;
		}
		static [Symbol.hasInstance](val) {
			return val instanceof NativeHeaders;
		}
		get _headers() {
			if (!this.#headers) {
				const headers = new NativeHeaders();
				const rawHeaders = this.#req.rawHeaders;
				const len = rawHeaders.length;
				for (let i = 0; i < len; i += 2) {
					const key = rawHeaders[i];
					if (key.charCodeAt(0) === 58) continue;
					const value = rawHeaders[i + 1];
					headers.append(key, value);
				}
				this.#headers = headers;
			}
			return this.#headers;
		}
		get(name) {
			if (this.#headers) return this.#headers.get(name);
			const value = this.#req.headers[name.toLowerCase()];
			return Array.isArray(value) ? value.join(", ") : value || null;
		}
		has(name) {
			if (this.#headers) return this.#headers.has(name);
			return name.toLowerCase() in this.#req.headers;
		}
		getSetCookie() {
			if (this.#headers) return this.#headers.getSetCookie();
			const value = this.#req.headers["set-cookie"];
			return Array.isArray(value) ? value : value ? [value] : [];
		}
		*_entries() {
			const rawHeaders = this.#req.rawHeaders;
			const len = rawHeaders.length;
			for (let i = 0; i < len; i += 2) {
				const key = rawHeaders[i];
				if (key.charCodeAt(0) === 58) continue;
				yield [key.toLowerCase(), rawHeaders[i + 1]];
			}
		}
		entries() {
			return this.#headers ? this.#headers.entries() : this._entries();
		}
		[Symbol.iterator]() {
			return this.entries();
		}
	}
	lazyInherit(Headers.prototype, NativeHeaders.prototype, "_headers");
	Object.setPrototypeOf(Headers, NativeHeaders);
	Object.setPrototypeOf(Headers.prototype, NativeHeaders.prototype);
	return Headers;
})();
var NodeRequest = /* @__PURE__ */ (() => {
	const NativeRequest = globalThis.Request;
	class Request {
		runtime;
		#req;
		#url;
		#bodyStream;
		#request;
		#headers;
		#abortController;
		constructor(ctx) {
			this.#req = ctx.req;
			this.runtime = {
				name: "node",
				node: ctx
			};
		}
		static [Symbol.hasInstance](val) {
			return val instanceof NativeRequest;
		}
		get ip() {
			return this.#req.socket?.remoteAddress;
		}
		get method() {
			if (this.#request) return this.#request.method;
			return this.#req.method || "GET";
		}
		get _url() {
			return this.#url ||= new NodeRequestURL({ req: this.#req });
		}
		set _url(url) {
			this.#url = url;
		}
		get url() {
			if (this.#request) return this.#request.url;
			return this._url.href;
		}
		get headers() {
			if (this.#request) return this.#request.headers;
			return this.#headers ||= new NodeRequestHeaders(this.#req);
		}
		get _abortController() {
			if (!this.#abortController) {
				this.#abortController = new AbortController();
				const { req, res } = this.runtime.node;
				const abortController = this.#abortController;
				const abort = (err) => abortController.abort?.(err);
				if (res) res.once("close", () => {
					const reqError = req.errored;
					if (reqError) abort(reqError);
					else if (!res.writableEnded) abort();
				});
				else req.once("close", () => {
					if (!req.complete) abort();
				});
			}
			return this.#abortController;
		}
		get signal() {
			return this.#request ? this.#request.signal : this._abortController.signal;
		}
		get body() {
			if (this.#request) return this.#request.body;
			if (this.#bodyStream === void 0) {
				const method = this.method;
				this.#bodyStream = !(method === "GET" || method === "HEAD") ? Readable.toWeb(this.#req) : null;
			}
			return this.#bodyStream;
		}
		text() {
			if (this.#request) return this.#request.text();
			if (this.#bodyStream !== void 0) return this.#bodyStream ? new Response(this.#bodyStream).text() : Promise.resolve("");
			return readBody(this.#req).then((buf) => buf.toString());
		}
		json() {
			if (this.#request) return this.#request.json();
			return this.text().then((text) => JSON.parse(text));
		}
		get _request() {
			if (!this.#request) {
				const body = this.body;
				this.#request = new NativeRequest(this.url, {
					method: this.method,
					headers: this.headers,
					signal: this._abortController.signal,
					body,
					duplex: body ? "half" : void 0
				});
				this.#headers = void 0;
				this.#bodyStream = void 0;
			}
			return this.#request;
		}
	}
	lazyInherit(Request.prototype, NativeRequest.prototype, "_request");
	Object.setPrototypeOf(Request.prototype, NativeRequest.prototype);
	return Request;
})();
function readBody(req) {
	if ("rawBody" in req && Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody);
	return new Promise((resolve, reject) => {
		const chunks = [];
		const onData = (chunk) => {
			chunks.push(chunk);
		};
		const onError = (err) => {
			reject(err);
		};
		const onEnd = () => {
			req.off("error", onError);
			req.off("data", onData);
			resolve(Buffer.concat(chunks));
		};
		req.on("data", onData).once("end", onEnd).once("error", onError);
	});
}
/**
* Fast Response for Node.js runtime
*
* It is faster because in most cases it doesn't create a full Response instance.
*/
var NodeResponse = /* @__PURE__ */ (() => {
	const NativeResponse = globalThis.Response;
	const STATUS_CODES = globalThis.process?.getBuiltinModule?.("node:http")?.STATUS_CODES || {};
	class NodeResponse {
		#body;
		#init;
		#headers;
		#response;
		constructor(body, init) {
			this.#body = body;
			this.#init = init;
		}
		static [Symbol.hasInstance](val) {
			return val instanceof NativeResponse;
		}
		get status() {
			return this.#response?.status || this.#init?.status || 200;
		}
		get statusText() {
			return this.#response?.statusText || this.#init?.statusText || STATUS_CODES[this.status] || "";
		}
		get headers() {
			if (this.#response) return this.#response.headers;
			if (this.#headers) return this.#headers;
			const initHeaders = this.#init?.headers;
			return this.#headers = initHeaders instanceof Headers ? initHeaders : new Headers(initHeaders);
		}
		get ok() {
			if (this.#response) return this.#response.ok;
			const status = this.status;
			return status >= 200 && status < 300;
		}
		get _response() {
			if (this.#response) return this.#response;
			let body = this.#body;
			if (body && typeof body.pipe === "function" && !(body instanceof Readable)) {
				const stream = new PassThrough();
				body.pipe(stream);
				const abort = body.abort;
				if (abort) stream.once("close", () => abort());
				body = stream;
			}
			this.#response = new NativeResponse(body, this.#headers ? {
				...this.#init,
				headers: this.#headers
			} : this.#init);
			this.#init = void 0;
			this.#headers = void 0;
			this.#body = void 0;
			return this.#response;
		}
		_toNodeResponse() {
			const status = this.status;
			const statusText = this.statusText;
			let body;
			let contentType;
			let contentLength;
			if (this.#response) body = this.#response.body;
			else if (this.#body) if (this.#body instanceof ReadableStream) body = this.#body;
			else if (typeof this.#body === "string") {
				body = this.#body;
				contentType = "text/plain; charset=UTF-8";
				contentLength = Buffer.byteLength(this.#body);
			} else if (this.#body instanceof ArrayBuffer) {
				body = Buffer.from(this.#body);
				contentLength = this.#body.byteLength;
			} else if (this.#body instanceof Uint8Array) {
				body = this.#body;
				contentLength = this.#body.byteLength;
			} else if (this.#body instanceof DataView) {
				body = Buffer.from(this.#body.buffer);
				contentLength = this.#body.byteLength;
			} else if (this.#body instanceof Blob) {
				body = this.#body.stream();
				contentType = this.#body.type;
				contentLength = this.#body.size;
			} else if (typeof this.#body.pipe === "function") body = this.#body;
			else body = this._response.body;
			const headers = [];
			const initHeaders = this.#init?.headers;
			const headerEntries = this.#response?.headers || this.#headers || (initHeaders ? Array.isArray(initHeaders) ? initHeaders : initHeaders?.entries ? initHeaders.entries() : Object.entries(initHeaders).map(([k, v]) => [k.toLowerCase(), v]) : void 0);
			let hasContentTypeHeader;
			let hasContentLength;
			if (headerEntries) for (const [key, value] of headerEntries) {
				if (Array.isArray(value)) for (const v of value) headers.push([key, v]);
				else headers.push([key, value]);
				if (key === "content-type") hasContentTypeHeader = true;
				else if (key === "content-length") hasContentLength = true;
			}
			if (contentType && !hasContentTypeHeader) headers.push(["content-type", contentType]);
			if (contentLength && !hasContentLength) headers.push(["content-length", String(contentLength)]);
			this.#init = void 0;
			this.#headers = void 0;
			this.#response = void 0;
			this.#body = void 0;
			return {
				status,
				statusText,
				headers,
				body
			};
		}
	}
	lazyInherit(NodeResponse.prototype, NativeResponse.prototype, "_response");
	Object.setPrototypeOf(NodeResponse, NativeResponse);
	Object.setPrototypeOf(NodeResponse.prototype, NativeResponse.prototype);
	return NodeResponse;
})();
function serve$1(options) {
	return new NodeServer(options);
}
var NodeServer = class {
	runtime = "node";
	options;
	node;
	serveOptions;
	fetch;
	waitUntil;
	#isSecure;
	#listeningPromise;
	#wait;
	constructor(options) {
		this.options = {
			...options,
			middleware: [...options.middleware || []]
		};
		for (const plugin of options.plugins || []) plugin(this);
		errorPlugin(this);
		const fetchHandler = this.fetch = wrapFetch(this);
		const handler = (nodeReq, nodeRes) => {
			const request = new NodeRequest({
				req: nodeReq,
				res: nodeRes
			});
			request.waitUntil = this.#wait?.waitUntil;
			const res = fetchHandler(request);
			return res instanceof Promise ? res.then((resolvedRes) => sendNodeResponse(nodeRes, resolvedRes)) : sendNodeResponse(nodeRes, res);
		};
		this.node = {
			handler,
			server: void 0
		};
		const loader = globalThis.__srvxLoader__;
		if (loader) {
			loader({ server: this });
			return;
		}
		gracefulShutdownPlugin(this);
		this.#wait = createWaitUntil();
		this.waitUntil = this.#wait.waitUntil;
		const tls = resolveTLSOptions(this.options);
		const { port, hostname: host } = resolvePortAndHost(this.options);
		this.serveOptions = {
			port,
			host,
			exclusive: !this.options.reusePort,
			...tls ? {
				cert: tls.cert,
				key: tls.key,
				passphrase: tls.passphrase
			} : {},
			...this.options.node
		};
		let server;
		this.#isSecure = !!this.serveOptions.cert && this.options.protocol !== "http";
		if (this.options.node?.http2 ?? this.#isSecure) if (this.#isSecure) server = nodeHTTP2.createSecureServer({
			allowHTTP1: true,
			...this.serveOptions
		}, handler);
		else throw new Error("node.http2 option requires tls certificate!");
		else if (this.#isSecure) server = nodeHTTPS.createServer(this.serveOptions, handler);
		else server = http.createServer(this.serveOptions, handler);
		this.node.server = server;
		if (!options.manual) this.serve();
	}
	serve() {
		if (this.#listeningPromise) return Promise.resolve(this.#listeningPromise).then(() => this);
		this.#listeningPromise = new Promise((resolve, reject) => {
			this.node.server.once("error", (error) => {
				reject(error);
			});
			this.node.server.listen(this.serveOptions, () => {
				printListening(this.options, this.url);
				resolve();
			});
		});
		return this.#listeningPromise;
	}
	get url() {
		const addr = this.node?.server?.address();
		if (!addr) return;
		return typeof addr === "string" ? addr : fmtURL(addr.address, addr.port, this.#isSecure);
	}
	ready() {
		return Promise.resolve(this.#listeningPromise).then(() => this);
	}
	async close(closeAll) {
		await Promise.all([this.#wait?.wait(), new Promise((resolve, reject) => {
			const server = this.node?.server;
			if (server && closeAll && "closeAllConnections" in server) server.closeAllConnections();
			if (!server || !server.listening) return resolve();
			server.close((error) => error ? reject(error) : resolve());
		})]);
	}
};
function freezeApp(app) {
	app.config = Object.freeze(app.config);
	app["~addRoute"] = () => {
		throw new Error("Cannot add routes after the server init.");
	};
}
var kEventNS = "h3.internal.event.";
var kEventRes = /* @__PURE__ */ Symbol.for(`${kEventNS}res`);
var kEventResHeaders = /* @__PURE__ */ Symbol.for(`${kEventNS}res.headers`);
var H3Event = class {
	app;
	req;
	url;
	context;
	static __is_event__ = true;
	constructor(req, context, app) {
		this.context = context || req.context || new NullProtoObj();
		this.req = req;
		this.app = app;
		const _url = req._url;
		this.url = _url && _url instanceof URL ? _url : new FastURL(req.url);
	}
	get res() {
		return this[kEventRes] ||= new H3EventResponse();
	}
	get runtime() {
		return this.req.runtime;
	}
	waitUntil(promise) {
		this.req.waitUntil?.(promise);
	}
	toString() {
		return `[${this.req.method}] ${this.req.url}`;
	}
	toJSON() {
		return this.toString();
	}
	get node() {
		return this.req.runtime?.node;
	}
	get headers() {
		return this.req.headers;
	}
	get path() {
		return this.url.pathname + this.url.search;
	}
	get method() {
		return this.req.method;
	}
};
var H3EventResponse = class {
	status;
	statusText;
	get headers() {
		return this[kEventResHeaders] ||= new Headers();
	}
};
var DISALLOWED_STATUS_CHARS = /[^\u0009\u0020-\u007E]/g;
function sanitizeStatusMessage(statusMessage = "") {
	return statusMessage.replace(DISALLOWED_STATUS_CHARS, "");
}
function sanitizeStatusCode(statusCode, defaultStatusCode = 200) {
	if (!statusCode) return defaultStatusCode;
	if (typeof statusCode === "string") statusCode = +statusCode;
	if (statusCode < 100 || statusCode > 599) return defaultStatusCode;
	return statusCode;
}
var HTTPError = class HTTPError extends Error {
	get name() {
		return "HTTPError";
	}
	status;
	statusText;
	headers;
	cause;
	data;
	body;
	unhandled;
	static isError(input) {
		return input instanceof Error && input?.name === "HTTPError";
	}
	static status(status, statusText, details) {
		return new HTTPError({
			...details,
			statusText,
			status
		});
	}
	constructor(arg1, arg2) {
		let messageInput;
		let details;
		if (typeof arg1 === "string") {
			messageInput = arg1;
			details = arg2;
		} else details = arg1;
		const status = sanitizeStatusCode(details?.status || (details?.cause)?.status || details?.status || details?.statusCode, 500);
		const statusText = sanitizeStatusMessage(details?.statusText || (details?.cause)?.statusText || details?.statusText || details?.statusMessage);
		const message = messageInput || details?.message || (details?.cause)?.message || details?.statusText || details?.statusMessage || [
			"HTTPError",
			status,
			statusText
		].filter(Boolean).join(" ");
		super(message, { cause: details });
		this.cause = details;
		this.status = status;
		this.statusText = statusText || void 0;
		const rawHeaders = details?.headers || (details?.cause)?.headers;
		this.headers = rawHeaders ? new Headers(rawHeaders) : void 0;
		this.unhandled = details?.unhandled ?? (details?.cause)?.unhandled ?? void 0;
		this.data = details?.data;
		this.body = details?.body;
	}
	get statusCode() {
		return this.status;
	}
	get statusMessage() {
		return this.statusText;
	}
	toJSON() {
		const unhandled = this.unhandled;
		return {
			status: this.status,
			statusText: this.statusText,
			unhandled,
			message: unhandled ? "HTTPError" : this.message,
			data: unhandled ? void 0 : this.data,
			...unhandled ? void 0 : this.body
		};
	}
};
function isJSONSerializable(value, _type) {
	if (value === null || value === void 0) return true;
	if (_type !== "object") return _type === "boolean" || _type === "number" || _type === "string";
	if (typeof value.toJSON === "function") return true;
	if (Array.isArray(value)) return true;
	if (typeof value.pipe === "function" || typeof value.pipeTo === "function") return false;
	if (value instanceof NullProtoObj) return true;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
var kNotFound = /* @__PURE__ */ Symbol.for("h3.notFound");
var kHandled = /* @__PURE__ */ Symbol.for("h3.handled");
function toResponse(val, event, config = {}) {
	if (typeof val?.then === "function") return (val.catch?.((error) => error) || Promise.resolve(val)).then((resolvedVal) => toResponse(resolvedVal, event, config));
	const response = prepareResponse(val, event, config);
	if (typeof response?.then === "function") return toResponse(response, event, config);
	const { onResponse } = config;
	return onResponse ? Promise.resolve(onResponse(response, event)).then(() => response) : response;
}
var HTTPResponse = class {
	#headers;
	#init;
	body;
	constructor(body, init) {
		this.body = body;
		this.#init = init;
	}
	get status() {
		return this.#init?.status || 200;
	}
	get statusText() {
		return this.#init?.statusText || "OK";
	}
	get headers() {
		return this.#headers ||= new Headers(this.#init?.headers);
	}
};
function prepareResponse(val, event, config, nested) {
	if (val === kHandled) return new NodeResponse(null);
	if (val === kNotFound) val = new HTTPError({
		status: 404,
		message: `Cannot find any route matching [${event.req.method}] ${event.url}`
	});
	if (val && val instanceof Error) {
		const isHTTPError = HTTPError.isError(val);
		const error = isHTTPError ? val : new HTTPError(val);
		if (!isHTTPError) {
			error.unhandled = true;
			if (val?.stack) error.stack = val.stack;
		}
		if (error.unhandled && !config.silent) console.error(error);
		const { onError } = config;
		return onError && !nested ? Promise.resolve(onError(error, event)).catch((error) => error).then((newVal) => prepareResponse(newVal ?? val, event, config, true)) : errorResponse(error, config.debug);
	}
	const preparedRes = event[kEventRes];
	const preparedHeaders = preparedRes?.[kEventResHeaders];
	event[kEventRes] = void 0;
	if (!(val instanceof Response)) {
		const res = prepareResponseBody(val, event, config);
		const status = res.status || preparedRes?.status;
		return new NodeResponse(nullBody(event.req.method, status) ? null : res.body, {
			status,
			statusText: res.statusText || preparedRes?.statusText,
			headers: res.headers && preparedHeaders ? mergeHeaders$1(res.headers, preparedHeaders) : res.headers || preparedHeaders
		});
	}
	if (!preparedHeaders || nested || !val.ok) return val;
	try {
		mergeHeaders$1(val.headers, preparedHeaders, val.headers);
		return val;
	} catch {
		return new NodeResponse(nullBody(event.req.method, val.status) ? null : val.body, {
			status: val.status,
			statusText: val.statusText,
			headers: mergeHeaders$1(val.headers, preparedHeaders)
		});
	}
}
function mergeHeaders$1(base, overrides, target = new Headers(base)) {
	for (const [name, value] of overrides) if (name === "set-cookie") target.append(name, value);
	else target.set(name, value);
	return target;
}
var frozen = (name) => (...args) => {
	throw new Error(`Headers are frozen (${name} ${args.join(", ")})`);
};
var FrozenHeaders = class extends Headers {
	set = frozen("set");
	append = frozen("append");
	delete = frozen("delete");
};
var emptyHeaders = /* @__PURE__ */ new FrozenHeaders({ "content-length": "0" });
var jsonHeaders = /* @__PURE__ */ new FrozenHeaders({ "content-type": "application/json;charset=UTF-8" });
function prepareResponseBody(val, event, config) {
	if (val === null || val === void 0) return {
		body: "",
		headers: emptyHeaders
	};
	const valType = typeof val;
	if (valType === "string") return { body: val };
	if (val instanceof Uint8Array) {
		event.res.headers.set("content-length", val.byteLength.toString());
		return { body: val };
	}
	if (val instanceof HTTPResponse || val?.constructor?.name === "HTTPResponse") return val;
	if (isJSONSerializable(val, valType)) return {
		body: JSON.stringify(val, void 0, config.debug ? 2 : void 0),
		headers: jsonHeaders
	};
	if (valType === "bigint") return {
		body: val.toString(),
		headers: jsonHeaders
	};
	if (val instanceof Blob) {
		const headers = new Headers({
			"content-type": val.type,
			"content-length": val.size.toString()
		});
		let filename = val.name;
		if (filename) {
			filename = encodeURIComponent(filename);
			headers.set("content-disposition", `filename="${filename}"; filename*=UTF-8''${filename}`);
		}
		return {
			body: val.stream(),
			headers
		};
	}
	if (valType === "symbol") return { body: val.toString() };
	if (valType === "function") return { body: `${val.name}()` };
	return { body: val };
}
function nullBody(method, status) {
	return method === "HEAD" || status === 100 || status === 101 || status === 102 || status === 204 || status === 205 || status === 304;
}
function errorResponse(error, debug) {
	return new NodeResponse(JSON.stringify({
		...error.toJSON(),
		stack: debug && error.stack ? error.stack.split("\n").map((l) => l.trim()) : void 0
	}, void 0, debug ? 2 : void 0), {
		status: error.status,
		statusText: error.statusText,
		headers: error.headers ? mergeHeaders$1(jsonHeaders, error.headers) : new Headers(jsonHeaders)
	});
}
function normalizeMiddleware(input, opts = {}) {
	const matcher = createMatcher(opts);
	if (!matcher && (input.length > 1 || input.constructor?.name === "AsyncFunction")) return input;
	return (event, next) => {
		if (matcher && !matcher(event)) return next();
		const res = input(event, next);
		return res === void 0 || res === kNotFound ? next() : res;
	};
}
function createMatcher(opts) {
	if (!opts.route && !opts.method && !opts.match) return;
	const routeMatcher = opts.route ? routeToRegExp(opts.route) : void 0;
	const method = opts.method?.toUpperCase();
	return function _middlewareMatcher(event) {
		if (method && event.req.method !== method) return false;
		if (opts.match && !opts.match(event)) return false;
		if (!routeMatcher) return true;
		const match = event.url.pathname.match(routeMatcher);
		if (!match) return false;
		if (match.groups) event.context.middlewareParams = {
			...event.context.middlewareParams,
			...match.groups
		};
		return true;
	};
}
function callMiddleware(event, middleware, handler, index = 0) {
	if (index === middleware.length) return handler(event);
	const fn = middleware[index];
	let nextCalled;
	let nextResult;
	const next = () => {
		if (nextCalled) return nextResult;
		nextCalled = true;
		nextResult = callMiddleware(event, middleware, handler, index + 1);
		return nextResult;
	};
	const ret = fn(event, next);
	return isUnhandledResponse(ret) ? next() : typeof ret?.then === "function" ? ret.then((resolved) => isUnhandledResponse(resolved) ? next() : resolved) : ret;
}
function isUnhandledResponse(val) {
	return val === void 0 || val === kNotFound;
}
function toRequest(input, options) {
	if (typeof input === "string") {
		let url = input;
		if (url[0] === "/") {
			const headers = options?.headers ? new Headers(options.headers) : void 0;
			const host = headers?.get("host") || "localhost";
			url = `${headers?.get("x-forwarded-proto") === "https" ? "https" : "http"}://${host}${url}`;
		}
		return new Request(url, options);
	} else if (options || input instanceof URL) return new Request(input, options);
	return input;
}
function defineHandler(input) {
	if (typeof input === "function") return handlerWithFetch(input);
	const handler = input.handler || (input.fetch ? function _fetchHandler(event) {
		return input.fetch(event.req);
	} : NoHandler);
	return Object.assign(handlerWithFetch(input.middleware?.length ? function _handlerMiddleware(event) {
		return callMiddleware(event, input.middleware, handler);
	} : handler), input);
}
function handlerWithFetch(handler) {
	if ("fetch" in handler) return handler;
	return Object.assign(handler, { fetch: (req) => {
		if (typeof req === "string") req = new URL(req, "http://_");
		if (req instanceof URL) req = new Request(req);
		const event = new H3Event(req);
		try {
			return Promise.resolve(toResponse(handler(event), event));
		} catch (error) {
			return Promise.resolve(toResponse(error, event));
		}
	} });
}
function toEventHandler(handler) {
	if (typeof handler === "function") return handler;
	if (typeof handler?.handler === "function") return handler.handler;
	if (typeof handler?.fetch === "function") return function _fetchHandler(event) {
		return handler.fetch(event.req);
	};
}
var NoHandler = () => kNotFound;
var H3Core = class {
	config;
	"~middleware";
	"~routes" = [];
	constructor(config = {}) {
		this["~middleware"] = [];
		this.config = config;
		this.fetch = this.fetch.bind(this);
		this.handler = this.handler.bind(this);
	}
	fetch(request) {
		return this["~request"](request);
	}
	handler(event) {
		const route = this["~findRoute"](event);
		if (route) {
			event.context.params = route.params;
			event.context.matchedRoute = route.data;
		}
		const routeHandler = route?.data.handler || NoHandler;
		const middleware = this["~getMiddleware"](event, route);
		return middleware.length > 0 ? callMiddleware(event, middleware, routeHandler) : routeHandler(event);
	}
	"~request"(request, context) {
		const event = new H3Event(request, context, this);
		let handlerRes;
		try {
			if (this.config.onRequest) {
				const hookRes = this.config.onRequest(event);
				handlerRes = typeof hookRes?.then === "function" ? hookRes.then(() => this.handler(event)) : this.handler(event);
			} else handlerRes = this.handler(event);
		} catch (error) {
			handlerRes = Promise.reject(error);
		}
		return toResponse(handlerRes, event, this.config);
	}
	"~findRoute"(_event) {}
	"~addRoute"(_route) {
		this["~routes"].push(_route);
	}
	"~getMiddleware"(_event, route) {
		const routeMiddleware = route?.data.middleware;
		const globalMiddleware = this["~middleware"];
		return routeMiddleware ? [...globalMiddleware, ...routeMiddleware] : globalMiddleware;
	}
};
var H3 = /* @__PURE__ */ (() => {
	class H3 extends H3Core {
		"~rou3";
		constructor(config = {}) {
			super(config);
			this["~rou3"] = createRouter();
			this.request = this.request.bind(this);
			config.plugins?.forEach((plugin) => plugin(this));
		}
		register(plugin) {
			plugin(this);
			return this;
		}
		request(_req, _init, context) {
			return this["~request"](toRequest(_req, _init), context);
		}
		mount(base, input) {
			if ("handler" in input) {
				if (input["~middleware"].length > 0) this["~middleware"].push((event, next) => {
					const originalPathname = event.url.pathname;
					if (!originalPathname.startsWith(base)) return next();
					event.url.pathname = event.url.pathname.slice(base.length) || "/";
					return callMiddleware(event, input["~middleware"], () => {
						event.url.pathname = originalPathname;
						return next();
					});
				});
				for (const r of input["~routes"]) this["~addRoute"]({
					...r,
					route: base + r.route
				});
			} else {
				const fetchHandler = "fetch" in input ? input.fetch : input;
				this.all(`${base}/**`, function _mountedMiddleware(event) {
					const url = new URL(event.url);
					url.pathname = url.pathname.slice(base.length) || "/";
					return fetchHandler(new Request(url, event.req));
				});
			}
			return this;
		}
		on(method, route, handler, opts) {
			const _method = (method || "").toUpperCase();
			route = new URL(route, "http://_").pathname;
			this["~addRoute"]({
				method: _method,
				route,
				handler: toEventHandler(handler),
				middleware: opts?.middleware,
				meta: {
					...handler.meta,
					...opts?.meta
				}
			});
			return this;
		}
		all(route, handler, opts) {
			return this.on("", route, handler, opts);
		}
		"~findRoute"(_event) {
			return findRoute(this["~rou3"], _event.req.method, _event.url.pathname);
		}
		"~addRoute"(_route) {
			addRoute(this["~rou3"], _route.method, _route.route, _route);
			super["~addRoute"](_route);
		}
		use(arg1, arg2, arg3) {
			let route;
			let fn;
			let opts;
			if (typeof arg1 === "string") {
				route = arg1;
				fn = arg2;
				opts = arg3;
			} else {
				fn = arg1;
				opts = arg2;
			}
			this["~middleware"].push(normalizeMiddleware(fn, {
				...opts,
				route
			}));
			return this;
		}
	}
	for (const method of [
		"GET",
		"POST",
		"PUT",
		"DELETE",
		"PATCH",
		"HEAD",
		"OPTIONS",
		"CONNECT",
		"TRACE"
	]) H3Core.prototype[method.toLowerCase()] = function(route, handler, opts) {
		return this.on(method, route, handler, opts);
	};
	return H3;
})();
new TextEncoder();
function defineWebSocketHandler(hooks) {
	return defineHandler(function _webSocketHandler(event) {
		const crossws = typeof hooks === "function" ? hooks(event) : hooks;
		return Object.assign(new Response("WebSocket upgrade is required.", { status: 426 }), { crossws });
	});
}
function serve(app, options) {
	freezeApp(app);
	return serve$1({
		fetch: app.fetch,
		...options
	});
}
export { NodeRequest as i, H3 as n, defineWebSocketHandler as r, serve as t };
