#!/usr/bin/env node
import { createRequire } from "node:module";
import process$1 from "node:process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
//#region \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = /* @__PURE__ */ createRequire(import.meta.url);
//#endregion
//#region node_modules/.pnpm/@pnpm+constants@1001.3.1/node_modules/@pnpm/constants/lib/index.js
var require_lib$4 = /* @__PURE__ */ __commonJSMin(((exports) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.USEFUL_NON_ROOT_PNPM_FIELDS = exports.FULL_FILTERED_META_DIR = exports.FULL_META_DIR = exports.ABBREVIATED_META_DIR = exports.WORKSPACE_MANIFEST_FILENAME = exports.STORE_VERSION = exports.LAYOUT_VERSION = exports.ENGINE_NAME = exports.MANIFEST_BASE_NAMES = exports.LOCKFILE_VERSION = exports.LOCKFILE_MAJOR_VERSION = exports.WANTED_LOCKFILE = void 0;
	exports.getNodeBinLocationForCurrentOS = getNodeBinLocationForCurrentOS;
	exports.getDenoBinLocationForCurrentOS = getDenoBinLocationForCurrentOS;
	exports.getBunBinLocationForCurrentOS = getBunBinLocationForCurrentOS;
	exports.WANTED_LOCKFILE = "pnpm-lock.yaml";
	exports.LOCKFILE_MAJOR_VERSION = "9";
	exports.LOCKFILE_VERSION = `${exports.LOCKFILE_MAJOR_VERSION}.0`;
	exports.MANIFEST_BASE_NAMES = [
		"package.json",
		"package.json5",
		"package.yaml"
	];
	exports.ENGINE_NAME = `${process.platform};${process.arch};node${process.version.split(".")[0].substring(1)}`;
	exports.LAYOUT_VERSION = 5;
	exports.STORE_VERSION = "v10";
	exports.WORKSPACE_MANIFEST_FILENAME = "pnpm-workspace.yaml";
	exports.ABBREVIATED_META_DIR = "metadata-v1.3";
	exports.FULL_META_DIR = "metadata-full-v1.3";
	exports.FULL_FILTERED_META_DIR = "metadata-ff-v1.3";
	exports.USEFUL_NON_ROOT_PNPM_FIELDS = ["executionEnv"];
	function getNodeBinLocationForCurrentOS(platform = process.platform) {
		return platform === "win32" ? "node.exe" : "bin/node";
	}
	function getDenoBinLocationForCurrentOS(platform = process.platform) {
		return platform === "win32" ? "deno.exe" : "deno";
	}
	function getBunBinLocationForCurrentOS(platform = process.platform) {
		return platform === "win32" ? "bun.exe" : "bun";
	}
}));
//#endregion
//#region node_modules/.pnpm/minipass@7.1.3/node_modules/minipass/dist/commonjs/index.js
var require_commonjs = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Minipass = exports.isWritable = exports.isReadable = exports.isStream = void 0;
	const proc = typeof process === "object" && process ? process : {
		stdout: null,
		stderr: null
	};
	const node_events_1 = __require("node:events");
	const node_stream_1 = __importDefault(__require("node:stream"));
	const node_string_decoder_1 = __require("node:string_decoder");
	/**
	* Return true if the argument is a Minipass stream, Node stream, or something
	* else that Minipass can interact with.
	*/
	const isStream = (s) => !!s && typeof s === "object" && (s instanceof Minipass || s instanceof node_stream_1.default || (0, exports.isReadable)(s) || (0, exports.isWritable)(s));
	exports.isStream = isStream;
	/**
	* Return true if the argument is a valid {@link Minipass.Readable}
	*/
	const isReadable = (s) => !!s && typeof s === "object" && s instanceof node_events_1.EventEmitter && typeof s.pipe === "function" && s.pipe !== node_stream_1.default.Writable.prototype.pipe;
	exports.isReadable = isReadable;
	/**
	* Return true if the argument is a valid {@link Minipass.Writable}
	*/
	const isWritable = (s) => !!s && typeof s === "object" && s instanceof node_events_1.EventEmitter && typeof s.write === "function" && typeof s.end === "function";
	exports.isWritable = isWritable;
	const EOF = Symbol("EOF");
	const MAYBE_EMIT_END = Symbol("maybeEmitEnd");
	const EMITTED_END = Symbol("emittedEnd");
	const EMITTING_END = Symbol("emittingEnd");
	const EMITTED_ERROR = Symbol("emittedError");
	const CLOSED = Symbol("closed");
	const READ = Symbol("read");
	const FLUSH = Symbol("flush");
	const FLUSHCHUNK = Symbol("flushChunk");
	const ENCODING = Symbol("encoding");
	const DECODER = Symbol("decoder");
	const FLOWING = Symbol("flowing");
	const PAUSED = Symbol("paused");
	const RESUME = Symbol("resume");
	const BUFFER = Symbol("buffer");
	const PIPES = Symbol("pipes");
	const BUFFERLENGTH = Symbol("bufferLength");
	const BUFFERPUSH = Symbol("bufferPush");
	const BUFFERSHIFT = Symbol("bufferShift");
	const OBJECTMODE = Symbol("objectMode");
	const DESTROYED = Symbol("destroyed");
	const ERROR = Symbol("error");
	const EMITDATA = Symbol("emitData");
	const EMITEND = Symbol("emitEnd");
	const EMITEND2 = Symbol("emitEnd2");
	const ASYNC = Symbol("async");
	const ABORT = Symbol("abort");
	const ABORTED = Symbol("aborted");
	const SIGNAL = Symbol("signal");
	const DATALISTENERS = Symbol("dataListeners");
	const DISCARDED = Symbol("discarded");
	const defer = (fn) => Promise.resolve().then(fn);
	const nodefer = (fn) => fn();
	const isEndish = (ev) => ev === "end" || ev === "finish" || ev === "prefinish";
	const isArrayBufferLike = (b) => b instanceof ArrayBuffer || !!b && typeof b === "object" && b.constructor && b.constructor.name === "ArrayBuffer" && b.byteLength >= 0;
	const isArrayBufferView = (b) => !Buffer.isBuffer(b) && ArrayBuffer.isView(b);
	/**
	* Internal class representing a pipe to a destination stream.
	*
	* @internal
	*/
	var Pipe = class {
		src;
		dest;
		opts;
		ondrain;
		constructor(src, dest, opts) {
			this.src = src;
			this.dest = dest;
			this.opts = opts;
			this.ondrain = () => src[RESUME]();
			this.dest.on("drain", this.ondrain);
		}
		unpipe() {
			this.dest.removeListener("drain", this.ondrain);
		}
		/* c8 ignore start */
		proxyErrors(_er) {}
		/* c8 ignore stop */
		end() {
			this.unpipe();
			if (this.opts.end) this.dest.end();
		}
	};
	/**
	* Internal class representing a pipe to a destination stream where
	* errors are proxied.
	*
	* @internal
	*/
	var PipeProxyErrors = class extends Pipe {
		unpipe() {
			this.src.removeListener("error", this.proxyErrors);
			super.unpipe();
		}
		constructor(src, dest, opts) {
			super(src, dest, opts);
			this.proxyErrors = (er) => this.dest.emit("error", er);
			src.on("error", this.proxyErrors);
		}
	};
	const isObjectModeOptions = (o) => !!o.objectMode;
	const isEncodingOptions = (o) => !o.objectMode && !!o.encoding && o.encoding !== "buffer";
	/**
	* Main export, the Minipass class
	*
	* `RType` is the type of data emitted, defaults to Buffer
	*
	* `WType` is the type of data to be written, if RType is buffer or string,
	* then any {@link Minipass.ContiguousData} is allowed.
	*
	* `Events` is the set of event handler signatures that this object
	* will emit, see {@link Minipass.Events}
	*/
	var Minipass = class extends node_events_1.EventEmitter {
		[FLOWING] = false;
		[PAUSED] = false;
		[PIPES] = [];
		[BUFFER] = [];
		[OBJECTMODE];
		[ENCODING];
		[ASYNC];
		[DECODER];
		[EOF] = false;
		[EMITTED_END] = false;
		[EMITTING_END] = false;
		[CLOSED] = false;
		[EMITTED_ERROR] = null;
		[BUFFERLENGTH] = 0;
		[DESTROYED] = false;
		[SIGNAL];
		[ABORTED] = false;
		[DATALISTENERS] = 0;
		[DISCARDED] = false;
		/**
		* true if the stream can be written
		*/
		writable = true;
		/**
		* true if the stream can be read
		*/
		readable = true;
		/**
		* If `RType` is Buffer, then options do not need to be provided.
		* Otherwise, an options object must be provided to specify either
		* {@link Minipass.SharedOptions.objectMode} or
		* {@link Minipass.SharedOptions.encoding}, as appropriate.
		*/
		constructor(...args) {
			const options = args[0] || {};
			super();
			if (options.objectMode && typeof options.encoding === "string") throw new TypeError("Encoding and objectMode may not be used together");
			if (isObjectModeOptions(options)) {
				this[OBJECTMODE] = true;
				this[ENCODING] = null;
			} else if (isEncodingOptions(options)) {
				this[ENCODING] = options.encoding;
				this[OBJECTMODE] = false;
			} else {
				this[OBJECTMODE] = false;
				this[ENCODING] = null;
			}
			this[ASYNC] = !!options.async;
			this[DECODER] = this[ENCODING] ? new node_string_decoder_1.StringDecoder(this[ENCODING]) : null;
			if (options && options.debugExposeBuffer === true) Object.defineProperty(this, "buffer", { get: () => this[BUFFER] });
			if (options && options.debugExposePipes === true) Object.defineProperty(this, "pipes", { get: () => this[PIPES] });
			const { signal } = options;
			if (signal) {
				this[SIGNAL] = signal;
				if (signal.aborted) this[ABORT]();
				else signal.addEventListener("abort", () => this[ABORT]());
			}
		}
		/**
		* The amount of data stored in the buffer waiting to be read.
		*
		* For Buffer strings, this will be the total byte length.
		* For string encoding streams, this will be the string character length,
		* according to JavaScript's `string.length` logic.
		* For objectMode streams, this is a count of the items waiting to be
		* emitted.
		*/
		get bufferLength() {
			return this[BUFFERLENGTH];
		}
		/**
		* The `BufferEncoding` currently in use, or `null`
		*/
		get encoding() {
			return this[ENCODING];
		}
		/**
		* @deprecated - This is a read only property
		*/
		set encoding(_enc) {
			throw new Error("Encoding must be set at instantiation time");
		}
		/**
		* @deprecated - Encoding may only be set at instantiation time
		*/
		setEncoding(_enc) {
			throw new Error("Encoding must be set at instantiation time");
		}
		/**
		* True if this is an objectMode stream
		*/
		get objectMode() {
			return this[OBJECTMODE];
		}
		/**
		* @deprecated - This is a read-only property
		*/
		set objectMode(_om) {
			throw new Error("objectMode must be set at instantiation time");
		}
		/**
		* true if this is an async stream
		*/
		get ["async"]() {
			return this[ASYNC];
		}
		/**
		* Set to true to make this stream async.
		*
		* Once set, it cannot be unset, as this would potentially cause incorrect
		* behavior.  Ie, a sync stream can be made async, but an async stream
		* cannot be safely made sync.
		*/
		set ["async"](a) {
			this[ASYNC] = this[ASYNC] || !!a;
		}
		[ABORT]() {
			this[ABORTED] = true;
			this.emit("abort", this[SIGNAL]?.reason);
			this.destroy(this[SIGNAL]?.reason);
		}
		/**
		* True if the stream has been aborted.
		*/
		get aborted() {
			return this[ABORTED];
		}
		/**
		* No-op setter. Stream aborted status is set via the AbortSignal provided
		* in the constructor options.
		*/
		set aborted(_) {}
		write(chunk, encoding, cb) {
			if (this[ABORTED]) return false;
			if (this[EOF]) throw new Error("write after end");
			if (this[DESTROYED]) {
				this.emit("error", Object.assign(/* @__PURE__ */ new Error("Cannot call write after a stream was destroyed"), { code: "ERR_STREAM_DESTROYED" }));
				return true;
			}
			if (typeof encoding === "function") {
				cb = encoding;
				encoding = "utf8";
			}
			if (!encoding) encoding = "utf8";
			const fn = this[ASYNC] ? defer : nodefer;
			if (!this[OBJECTMODE] && !Buffer.isBuffer(chunk)) {
				if (isArrayBufferView(chunk)) chunk = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
				else if (isArrayBufferLike(chunk)) chunk = Buffer.from(chunk);
				else if (typeof chunk !== "string") throw new Error("Non-contiguous data written to non-objectMode stream");
			}
			if (this[OBJECTMODE]) {
				/* c8 ignore start */
				if (this[FLOWING] && this[BUFFERLENGTH] !== 0) this[FLUSH](true);
				/* c8 ignore stop */
				if (this[FLOWING]) this.emit("data", chunk);
				else this[BUFFERPUSH](chunk);
				if (this[BUFFERLENGTH] !== 0) this.emit("readable");
				if (cb) fn(cb);
				return this[FLOWING];
			}
			if (!chunk.length) {
				if (this[BUFFERLENGTH] !== 0) this.emit("readable");
				if (cb) fn(cb);
				return this[FLOWING];
			}
			if (typeof chunk === "string" && !(encoding === this[ENCODING] && !this[DECODER]?.lastNeed)) chunk = Buffer.from(chunk, encoding);
			if (Buffer.isBuffer(chunk) && this[ENCODING]) chunk = this[DECODER].write(chunk);
			if (this[FLOWING] && this[BUFFERLENGTH] !== 0) this[FLUSH](true);
			if (this[FLOWING]) this.emit("data", chunk);
			else this[BUFFERPUSH](chunk);
			if (this[BUFFERLENGTH] !== 0) this.emit("readable");
			if (cb) fn(cb);
			return this[FLOWING];
		}
		/**
		* Low-level explicit read method.
		*
		* In objectMode, the argument is ignored, and one item is returned if
		* available.
		*
		* `n` is the number of bytes (or in the case of encoding streams,
		* characters) to consume. If `n` is not provided, then the entire buffer
		* is returned, or `null` is returned if no data is available.
		*
		* If `n` is greater that the amount of data in the internal buffer,
		* then `null` is returned.
		*/
		read(n) {
			if (this[DESTROYED]) return null;
			this[DISCARDED] = false;
			if (this[BUFFERLENGTH] === 0 || n === 0 || n && n > this[BUFFERLENGTH]) {
				this[MAYBE_EMIT_END]();
				return null;
			}
			if (this[OBJECTMODE]) n = null;
			if (this[BUFFER].length > 1 && !this[OBJECTMODE]) this[BUFFER] = [this[ENCODING] ? this[BUFFER].join("") : Buffer.concat(this[BUFFER], this[BUFFERLENGTH])];
			const ret = this[READ](n || null, this[BUFFER][0]);
			this[MAYBE_EMIT_END]();
			return ret;
		}
		[READ](n, chunk) {
			if (this[OBJECTMODE]) this[BUFFERSHIFT]();
			else {
				const c = chunk;
				if (n === c.length || n === null) this[BUFFERSHIFT]();
				else if (typeof c === "string") {
					this[BUFFER][0] = c.slice(n);
					chunk = c.slice(0, n);
					this[BUFFERLENGTH] -= n;
				} else {
					this[BUFFER][0] = c.subarray(n);
					chunk = c.subarray(0, n);
					this[BUFFERLENGTH] -= n;
				}
			}
			this.emit("data", chunk);
			if (!this[BUFFER].length && !this[EOF]) this.emit("drain");
			return chunk;
		}
		end(chunk, encoding, cb) {
			if (typeof chunk === "function") {
				cb = chunk;
				chunk = void 0;
			}
			if (typeof encoding === "function") {
				cb = encoding;
				encoding = "utf8";
			}
			if (chunk !== void 0) this.write(chunk, encoding);
			if (cb) this.once("end", cb);
			this[EOF] = true;
			this.writable = false;
			if (this[FLOWING] || !this[PAUSED]) this[MAYBE_EMIT_END]();
			return this;
		}
		[RESUME]() {
			if (this[DESTROYED]) return;
			if (!this[DATALISTENERS] && !this[PIPES].length) this[DISCARDED] = true;
			this[PAUSED] = false;
			this[FLOWING] = true;
			this.emit("resume");
			if (this[BUFFER].length) this[FLUSH]();
			else if (this[EOF]) this[MAYBE_EMIT_END]();
			else this.emit("drain");
		}
		/**
		* Resume the stream if it is currently in a paused state
		*
		* If called when there are no pipe destinations or `data` event listeners,
		* this will place the stream in a "discarded" state, where all data will
		* be thrown away. The discarded state is removed if a pipe destination or
		* data handler is added, if pause() is called, or if any synchronous or
		* asynchronous iteration is started.
		*/
		resume() {
			return this[RESUME]();
		}
		/**
		* Pause the stream
		*/
		pause() {
			this[FLOWING] = false;
			this[PAUSED] = true;
			this[DISCARDED] = false;
		}
		/**
		* true if the stream has been forcibly destroyed
		*/
		get destroyed() {
			return this[DESTROYED];
		}
		/**
		* true if the stream is currently in a flowing state, meaning that
		* any writes will be immediately emitted.
		*/
		get flowing() {
			return this[FLOWING];
		}
		/**
		* true if the stream is currently in a paused state
		*/
		get paused() {
			return this[PAUSED];
		}
		[BUFFERPUSH](chunk) {
			if (this[OBJECTMODE]) this[BUFFERLENGTH] += 1;
			else this[BUFFERLENGTH] += chunk.length;
			this[BUFFER].push(chunk);
		}
		[BUFFERSHIFT]() {
			if (this[OBJECTMODE]) this[BUFFERLENGTH] -= 1;
			else this[BUFFERLENGTH] -= this[BUFFER][0].length;
			return this[BUFFER].shift();
		}
		[FLUSH](noDrain = false) {
			do			;
while (this[FLUSHCHUNK](this[BUFFERSHIFT]()) && this[BUFFER].length);
			if (!noDrain && !this[BUFFER].length && !this[EOF]) this.emit("drain");
		}
		[FLUSHCHUNK](chunk) {
			this.emit("data", chunk);
			return this[FLOWING];
		}
		/**
		* Pipe all data emitted by this stream into the destination provided.
		*
		* Triggers the flow of data.
		*/
		pipe(dest, opts) {
			if (this[DESTROYED]) return dest;
			this[DISCARDED] = false;
			const ended = this[EMITTED_END];
			opts = opts || {};
			if (dest === proc.stdout || dest === proc.stderr) opts.end = false;
			else opts.end = opts.end !== false;
			opts.proxyErrors = !!opts.proxyErrors;
			if (ended) {
				if (opts.end) dest.end();
			} else {
				this[PIPES].push(!opts.proxyErrors ? new Pipe(this, dest, opts) : new PipeProxyErrors(this, dest, opts));
				if (this[ASYNC]) defer(() => this[RESUME]());
				else this[RESUME]();
			}
			return dest;
		}
		/**
		* Fully unhook a piped destination stream.
		*
		* If the destination stream was the only consumer of this stream (ie,
		* there are no other piped destinations or `'data'` event listeners)
		* then the flow of data will stop until there is another consumer or
		* {@link Minipass#resume} is explicitly called.
		*/
		unpipe(dest) {
			const p = this[PIPES].find((p) => p.dest === dest);
			if (p) {
				if (this[PIPES].length === 1) {
					if (this[FLOWING] && this[DATALISTENERS] === 0) this[FLOWING] = false;
					this[PIPES] = [];
				} else this[PIPES].splice(this[PIPES].indexOf(p), 1);
				p.unpipe();
			}
		}
		/**
		* Alias for {@link Minipass#on}
		*/
		addListener(ev, handler) {
			return this.on(ev, handler);
		}
		/**
		* Mostly identical to `EventEmitter.on`, with the following
		* behavior differences to prevent data loss and unnecessary hangs:
		*
		* - Adding a 'data' event handler will trigger the flow of data
		*
		* - Adding a 'readable' event handler when there is data waiting to be read
		*   will cause 'readable' to be emitted immediately.
		*
		* - Adding an 'endish' event handler ('end', 'finish', etc.) which has
		*   already passed will cause the event to be emitted immediately and all
		*   handlers removed.
		*
		* - Adding an 'error' event handler after an error has been emitted will
		*   cause the event to be re-emitted immediately with the error previously
		*   raised.
		*/
		on(ev, handler) {
			const ret = super.on(ev, handler);
			if (ev === "data") {
				this[DISCARDED] = false;
				this[DATALISTENERS]++;
				if (!this[PIPES].length && !this[FLOWING]) this[RESUME]();
			} else if (ev === "readable" && this[BUFFERLENGTH] !== 0) super.emit("readable");
			else if (isEndish(ev) && this[EMITTED_END]) {
				super.emit(ev);
				this.removeAllListeners(ev);
			} else if (ev === "error" && this[EMITTED_ERROR]) {
				const h = handler;
				if (this[ASYNC]) defer(() => h.call(this, this[EMITTED_ERROR]));
				else h.call(this, this[EMITTED_ERROR]);
			}
			return ret;
		}
		/**
		* Alias for {@link Minipass#off}
		*/
		removeListener(ev, handler) {
			return this.off(ev, handler);
		}
		/**
		* Mostly identical to `EventEmitter.off`
		*
		* If a 'data' event handler is removed, and it was the last consumer
		* (ie, there are no pipe destinations or other 'data' event listeners),
		* then the flow of data will stop until there is another consumer or
		* {@link Minipass#resume} is explicitly called.
		*/
		off(ev, handler) {
			const ret = super.off(ev, handler);
			if (ev === "data") {
				this[DATALISTENERS] = this.listeners("data").length;
				if (this[DATALISTENERS] === 0 && !this[DISCARDED] && !this[PIPES].length) this[FLOWING] = false;
			}
			return ret;
		}
		/**
		* Mostly identical to `EventEmitter.removeAllListeners`
		*
		* If all 'data' event handlers are removed, and they were the last consumer
		* (ie, there are no pipe destinations), then the flow of data will stop
		* until there is another consumer or {@link Minipass#resume} is explicitly
		* called.
		*/
		removeAllListeners(ev) {
			const ret = super.removeAllListeners(ev);
			if (ev === "data" || ev === void 0) {
				this[DATALISTENERS] = 0;
				if (!this[DISCARDED] && !this[PIPES].length) this[FLOWING] = false;
			}
			return ret;
		}
		/**
		* true if the 'end' event has been emitted
		*/
		get emittedEnd() {
			return this[EMITTED_END];
		}
		[MAYBE_EMIT_END]() {
			if (!this[EMITTING_END] && !this[EMITTED_END] && !this[DESTROYED] && this[BUFFER].length === 0 && this[EOF]) {
				this[EMITTING_END] = true;
				this.emit("end");
				this.emit("prefinish");
				this.emit("finish");
				if (this[CLOSED]) this.emit("close");
				this[EMITTING_END] = false;
			}
		}
		/**
		* Mostly identical to `EventEmitter.emit`, with the following
		* behavior differences to prevent data loss and unnecessary hangs:
		*
		* If the stream has been destroyed, and the event is something other
		* than 'close' or 'error', then `false` is returned and no handlers
		* are called.
		*
		* If the event is 'end', and has already been emitted, then the event
		* is ignored. If the stream is in a paused or non-flowing state, then
		* the event will be deferred until data flow resumes. If the stream is
		* async, then handlers will be called on the next tick rather than
		* immediately.
		*
		* If the event is 'close', and 'end' has not yet been emitted, then
		* the event will be deferred until after 'end' is emitted.
		*
		* If the event is 'error', and an AbortSignal was provided for the stream,
		* and there are no listeners, then the event is ignored, matching the
		* behavior of node core streams in the presense of an AbortSignal.
		*
		* If the event is 'finish' or 'prefinish', then all listeners will be
		* removed after emitting the event, to prevent double-firing.
		*/
		emit(ev, ...args) {
			const data = args[0];
			if (ev !== "error" && ev !== "close" && ev !== DESTROYED && this[DESTROYED]) return false;
			else if (ev === "data") return !this[OBJECTMODE] && !data ? false : this[ASYNC] ? (defer(() => this[EMITDATA](data)), true) : this[EMITDATA](data);
			else if (ev === "end") return this[EMITEND]();
			else if (ev === "close") {
				this[CLOSED] = true;
				if (!this[EMITTED_END] && !this[DESTROYED]) return false;
				const ret = super.emit("close");
				this.removeAllListeners("close");
				return ret;
			} else if (ev === "error") {
				this[EMITTED_ERROR] = data;
				super.emit(ERROR, data);
				const ret = !this[SIGNAL] || this.listeners("error").length ? super.emit("error", data) : false;
				this[MAYBE_EMIT_END]();
				return ret;
			} else if (ev === "resume") {
				const ret = super.emit("resume");
				this[MAYBE_EMIT_END]();
				return ret;
			} else if (ev === "finish" || ev === "prefinish") {
				const ret = super.emit(ev);
				this.removeAllListeners(ev);
				return ret;
			}
			const ret = super.emit(ev, ...args);
			this[MAYBE_EMIT_END]();
			return ret;
		}
		[EMITDATA](data) {
			for (const p of this[PIPES]) if (p.dest.write(data) === false) this.pause();
			const ret = this[DISCARDED] ? false : super.emit("data", data);
			this[MAYBE_EMIT_END]();
			return ret;
		}
		[EMITEND]() {
			if (this[EMITTED_END]) return false;
			this[EMITTED_END] = true;
			this.readable = false;
			return this[ASYNC] ? (defer(() => this[EMITEND2]()), true) : this[EMITEND2]();
		}
		[EMITEND2]() {
			if (this[DECODER]) {
				const data = this[DECODER].end();
				if (data) {
					for (const p of this[PIPES]) p.dest.write(data);
					if (!this[DISCARDED]) super.emit("data", data);
				}
			}
			for (const p of this[PIPES]) p.end();
			const ret = super.emit("end");
			this.removeAllListeners("end");
			return ret;
		}
		/**
		* Return a Promise that resolves to an array of all emitted data once
		* the stream ends.
		*/
		async collect() {
			const buf = Object.assign([], { dataLength: 0 });
			if (!this[OBJECTMODE]) buf.dataLength = 0;
			const p = this.promise();
			this.on("data", (c) => {
				buf.push(c);
				if (!this[OBJECTMODE]) buf.dataLength += c.length;
			});
			await p;
			return buf;
		}
		/**
		* Return a Promise that resolves to the concatenation of all emitted data
		* once the stream ends.
		*
		* Not allowed on objectMode streams.
		*/
		async concat() {
			if (this[OBJECTMODE]) throw new Error("cannot concat in objectMode");
			const buf = await this.collect();
			return this[ENCODING] ? buf.join("") : Buffer.concat(buf, buf.dataLength);
		}
		/**
		* Return a void Promise that resolves once the stream ends.
		*/
		async promise() {
			return new Promise((resolve, reject) => {
				this.on(DESTROYED, () => reject(/* @__PURE__ */ new Error("stream destroyed")));
				this.on("error", (er) => reject(er));
				this.on("end", () => resolve());
			});
		}
		/**
		* Asynchronous `for await of` iteration.
		*
		* This will continue emitting all chunks until the stream terminates.
		*/
		[Symbol.asyncIterator]() {
			this[DISCARDED] = false;
			let stopped = false;
			const stop = async () => {
				this.pause();
				stopped = true;
				return {
					value: void 0,
					done: true
				};
			};
			const next = () => {
				if (stopped) return stop();
				const res = this.read();
				if (res !== null) return Promise.resolve({
					done: false,
					value: res
				});
				if (this[EOF]) return stop();
				let resolve;
				let reject;
				const onerr = (er) => {
					this.off("data", ondata);
					this.off("end", onend);
					this.off(DESTROYED, ondestroy);
					stop();
					reject(er);
				};
				const ondata = (value) => {
					this.off("error", onerr);
					this.off("end", onend);
					this.off(DESTROYED, ondestroy);
					this.pause();
					resolve({
						value,
						done: !!this[EOF]
					});
				};
				const onend = () => {
					this.off("error", onerr);
					this.off("data", ondata);
					this.off(DESTROYED, ondestroy);
					stop();
					resolve({
						done: true,
						value: void 0
					});
				};
				const ondestroy = () => onerr(/* @__PURE__ */ new Error("stream destroyed"));
				return new Promise((res, rej) => {
					reject = rej;
					resolve = res;
					this.once(DESTROYED, ondestroy);
					this.once("error", onerr);
					this.once("end", onend);
					this.once("data", ondata);
				});
			};
			return {
				next,
				throw: stop,
				return: stop,
				[Symbol.asyncIterator]() {
					return this;
				},
				[Symbol.asyncDispose]: async () => {}
			};
		}
		/**
		* Synchronous `for of` iteration.
		*
		* The iteration will terminate when the internal buffer runs out, even
		* if the stream has not yet terminated.
		*/
		[Symbol.iterator]() {
			this[DISCARDED] = false;
			let stopped = false;
			const stop = () => {
				this.pause();
				this.off(ERROR, stop);
				this.off(DESTROYED, stop);
				this.off("end", stop);
				stopped = true;
				return {
					done: true,
					value: void 0
				};
			};
			const next = () => {
				if (stopped) return stop();
				const value = this.read();
				return value === null ? stop() : {
					done: false,
					value
				};
			};
			this.once("end", stop);
			this.once(ERROR, stop);
			this.once(DESTROYED, stop);
			return {
				next,
				throw: stop,
				return: stop,
				[Symbol.iterator]() {
					return this;
				},
				[Symbol.dispose]: () => {}
			};
		}
		/**
		* Destroy a stream, preventing it from being used for any further purpose.
		*
		* If the stream has a `close()` method, then it will be called on
		* destruction.
		*
		* After destruction, any attempt to write data, read data, or emit most
		* events will be ignored.
		*
		* If an error argument is provided, then it will be emitted in an
		* 'error' event.
		*/
		destroy(er) {
			if (this[DESTROYED]) {
				if (er) this.emit("error", er);
				else this.emit(DESTROYED);
				return this;
			}
			this[DESTROYED] = true;
			this[DISCARDED] = true;
			this[BUFFER].length = 0;
			this[BUFFERLENGTH] = 0;
			const wc = this;
			if (typeof wc.close === "function" && !this[CLOSED]) wc.close();
			if (er) this.emit("error", er);
			else this.emit(DESTROYED);
			return this;
		}
		/**
		* Alias for {@link isStream}
		*
		* Former export location, maintained for backwards compatibility.
		*
		* @deprecated
		*/
		static get isStream() {
			return exports.isStream;
		}
	};
	exports.Minipass = Minipass;
}));
//#endregion
//#region node_modules/.pnpm/ssri@10.0.5/node_modules/ssri/lib/index.js
var require_lib$3 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const crypto$1 = __require("crypto");
	const { Minipass } = require_commonjs();
	const SPEC_ALGORITHMS = [
		"sha512",
		"sha384",
		"sha256"
	];
	const DEFAULT_ALGORITHMS = ["sha512"];
	const BASE64_REGEX = /^[a-z0-9+/]+(?:=?=?)$/i;
	const SRI_REGEX = /^([a-z0-9]+)-([^?]+)([?\S*]*)$/;
	const STRICT_SRI_REGEX = /^([a-z0-9]+)-([A-Za-z0-9+/=]{44,88})(\?[\x21-\x7E]*)?$/;
	const VCHAR_REGEX = /^[\x21-\x7E]+$/;
	const getOptString = (options) => options?.length ? `?${options.join("?")}` : "";
	var IntegrityStream = class extends Minipass {
		#emittedIntegrity;
		#emittedSize;
		#emittedVerified;
		constructor(opts) {
			super();
			this.size = 0;
			this.opts = opts;
			this.#getOptions();
			if (opts?.algorithms) this.algorithms = [...opts.algorithms];
			else this.algorithms = [...DEFAULT_ALGORITHMS];
			if (this.algorithm !== null && !this.algorithms.includes(this.algorithm)) this.algorithms.push(this.algorithm);
			this.hashes = this.algorithms.map(crypto$1.createHash);
		}
		#getOptions() {
			this.sri = this.opts?.integrity ? parse(this.opts?.integrity, this.opts) : null;
			this.expectedSize = this.opts?.size;
			if (!this.sri) this.algorithm = null;
			else if (this.sri.isHash) {
				this.goodSri = true;
				this.algorithm = this.sri.algorithm;
			} else {
				this.goodSri = !this.sri.isEmpty();
				this.algorithm = this.sri.pickAlgorithm(this.opts);
			}
			this.digests = this.goodSri ? this.sri[this.algorithm] : null;
			this.optString = getOptString(this.opts?.options);
		}
		on(ev, handler) {
			if (ev === "size" && this.#emittedSize) return handler(this.#emittedSize);
			if (ev === "integrity" && this.#emittedIntegrity) return handler(this.#emittedIntegrity);
			if (ev === "verified" && this.#emittedVerified) return handler(this.#emittedVerified);
			return super.on(ev, handler);
		}
		emit(ev, data) {
			if (ev === "end") this.#onEnd();
			return super.emit(ev, data);
		}
		write(data) {
			this.size += data.length;
			this.hashes.forEach((h) => h.update(data));
			return super.write(data);
		}
		#onEnd() {
			if (!this.goodSri) this.#getOptions();
			const newSri = parse(this.hashes.map((h, i) => {
				return `${this.algorithms[i]}-${h.digest("base64")}${this.optString}`;
			}).join(" "), this.opts);
			const match = this.goodSri && newSri.match(this.sri, this.opts);
			if (typeof this.expectedSize === "number" && this.size !== this.expectedSize) {
				const err = /* @__PURE__ */ new Error(`stream size mismatch when checking ${this.sri}.\n  Wanted: ${this.expectedSize}\n  Found: ${this.size}`);
				err.code = "EBADSIZE";
				err.found = this.size;
				err.expected = this.expectedSize;
				err.sri = this.sri;
				this.emit("error", err);
			} else if (this.sri && !match) {
				const err = /* @__PURE__ */ new Error(`${this.sri} integrity checksum failed when using ${this.algorithm}: wanted ${this.digests} but got ${newSri}. (${this.size} bytes)`);
				err.code = "EINTEGRITY";
				err.found = newSri;
				err.expected = this.digests;
				err.algorithm = this.algorithm;
				err.sri = this.sri;
				this.emit("error", err);
			} else {
				this.#emittedSize = this.size;
				this.emit("size", this.size);
				this.#emittedIntegrity = newSri;
				this.emit("integrity", newSri);
				if (match) {
					this.#emittedVerified = match;
					this.emit("verified", match);
				}
			}
		}
	};
	var Hash = class {
		get isHash() {
			return true;
		}
		constructor(hash, opts) {
			const strict = opts?.strict;
			this.source = hash.trim();
			this.digest = "";
			this.algorithm = "";
			this.options = [];
			const match = this.source.match(strict ? STRICT_SRI_REGEX : SRI_REGEX);
			if (!match) return;
			if (strict && !SPEC_ALGORITHMS.includes(match[1])) return;
			this.algorithm = match[1];
			this.digest = match[2];
			const rawOpts = match[3];
			if (rawOpts) this.options = rawOpts.slice(1).split("?");
		}
		hexDigest() {
			return this.digest && Buffer.from(this.digest, "base64").toString("hex");
		}
		toJSON() {
			return this.toString();
		}
		match(integrity, opts) {
			const other = parse(integrity, opts);
			if (!other) return false;
			if (other.isIntegrity) {
				const algo = other.pickAlgorithm(opts, [this.algorithm]);
				if (!algo) return false;
				const foundHash = other[algo].find((hash) => hash.digest === this.digest);
				if (foundHash) return foundHash;
				return false;
			}
			return other.digest === this.digest ? other : false;
		}
		toString(opts) {
			if (opts?.strict) {
				if (!(SPEC_ALGORITHMS.includes(this.algorithm) && this.digest.match(BASE64_REGEX) && this.options.every((opt) => opt.match(VCHAR_REGEX)))) return "";
			}
			return `${this.algorithm}-${this.digest}${getOptString(this.options)}`;
		}
	};
	function integrityHashToString(toString, sep, opts, hashes) {
		const toStringIsNotEmpty = toString !== "";
		let shouldAddFirstSep = false;
		let complement = "";
		const lastIndex = hashes.length - 1;
		for (let i = 0; i < lastIndex; i++) {
			const hashString = Hash.prototype.toString.call(hashes[i], opts);
			if (hashString) {
				shouldAddFirstSep = true;
				complement += hashString;
				complement += sep;
			}
		}
		const finalHashString = Hash.prototype.toString.call(hashes[lastIndex], opts);
		if (finalHashString) {
			shouldAddFirstSep = true;
			complement += finalHashString;
		}
		if (toStringIsNotEmpty && shouldAddFirstSep) return toString + sep + complement;
		return toString + complement;
	}
	var Integrity = class {
		get isIntegrity() {
			return true;
		}
		toJSON() {
			return this.toString();
		}
		isEmpty() {
			return Object.keys(this).length === 0;
		}
		toString(opts) {
			let sep = opts?.sep || " ";
			let toString = "";
			if (opts?.strict) {
				sep = sep.replace(/\S+/g, " ");
				for (const hash of SPEC_ALGORITHMS) if (this[hash]) toString = integrityHashToString(toString, sep, opts, this[hash]);
			} else for (const hash of Object.keys(this)) toString = integrityHashToString(toString, sep, opts, this[hash]);
			return toString;
		}
		concat(integrity, opts) {
			const other = typeof integrity === "string" ? integrity : stringify(integrity, opts);
			return parse(`${this.toString(opts)} ${other}`, opts);
		}
		hexDigest() {
			return parse(this, { single: true }).hexDigest();
		}
		merge(integrity, opts) {
			const other = parse(integrity, opts);
			for (const algo in other) if (this[algo]) {
				if (!this[algo].find((hash) => other[algo].find((otherhash) => hash.digest === otherhash.digest))) throw new Error("hashes do not match, cannot update integrity");
			} else this[algo] = other[algo];
		}
		match(integrity, opts) {
			const other = parse(integrity, opts);
			if (!other) return false;
			const algo = other.pickAlgorithm(opts, Object.keys(this));
			return !!algo && this[algo] && other[algo] && this[algo].find((hash) => other[algo].find((otherhash) => hash.digest === otherhash.digest)) || false;
		}
		pickAlgorithm(opts, hashes) {
			const pickAlgorithm = opts?.pickAlgorithm || getPrioritizedHash;
			const keys = Object.keys(this).filter((k) => {
				if (hashes?.length) return hashes.includes(k);
				return true;
			});
			if (keys.length) return keys.reduce((acc, algo) => pickAlgorithm(acc, algo) || acc);
			return null;
		}
	};
	module.exports.parse = parse;
	function parse(sri, opts) {
		if (!sri) return null;
		if (typeof sri === "string") return _parse(sri, opts);
		else if (sri.algorithm && sri.digest) {
			const fullSri = new Integrity();
			fullSri[sri.algorithm] = [sri];
			return _parse(stringify(fullSri, opts), opts);
		} else return _parse(stringify(sri, opts), opts);
	}
	function _parse(integrity, opts) {
		if (opts?.single) return new Hash(integrity, opts);
		const hashes = integrity.trim().split(/\s+/).reduce((acc, string) => {
			const hash = new Hash(string, opts);
			if (hash.algorithm && hash.digest) {
				const algo = hash.algorithm;
				if (!acc[algo]) acc[algo] = [];
				acc[algo].push(hash);
			}
			return acc;
		}, new Integrity());
		return hashes.isEmpty() ? null : hashes;
	}
	module.exports.stringify = stringify;
	function stringify(obj, opts) {
		if (obj.algorithm && obj.digest) return Hash.prototype.toString.call(obj, opts);
		else if (typeof obj === "string") return stringify(parse(obj, opts), opts);
		else return Integrity.prototype.toString.call(obj, opts);
	}
	module.exports.fromHex = fromHex;
	function fromHex(hexDigest, algorithm, opts) {
		const optString = getOptString(opts?.options);
		return parse(`${algorithm}-${Buffer.from(hexDigest, "hex").toString("base64")}${optString}`, opts);
	}
	module.exports.fromData = fromData;
	function fromData(data, opts) {
		const algorithms = opts?.algorithms || [...DEFAULT_ALGORITHMS];
		const optString = getOptString(opts?.options);
		return algorithms.reduce((acc, algo) => {
			const hash = new Hash(`${algo}-${crypto$1.createHash(algo).update(data).digest("base64")}${optString}`, opts);
			/* istanbul ignore else - it would be VERY strange if the string we
			* just calculated with an algo did not have an algo or digest.
			*/
			if (hash.algorithm && hash.digest) {
				const hashAlgo = hash.algorithm;
				if (!acc[hashAlgo]) acc[hashAlgo] = [];
				acc[hashAlgo].push(hash);
			}
			return acc;
		}, new Integrity());
	}
	module.exports.fromStream = fromStream;
	function fromStream(stream, opts) {
		const istream = integrityStream(opts);
		return new Promise((resolve, reject) => {
			stream.pipe(istream);
			stream.on("error", reject);
			istream.on("error", reject);
			let sri;
			istream.on("integrity", (s) => {
				sri = s;
			});
			istream.on("end", () => resolve(sri));
			istream.resume();
		});
	}
	module.exports.checkData = checkData;
	function checkData(data, sri, opts) {
		sri = parse(sri, opts);
		if (!sri || !Object.keys(sri).length) if (opts?.error) throw Object.assign(/* @__PURE__ */ new Error("No valid integrity hashes to check against"), { code: "EINTEGRITY" });
		else return false;
		const algorithm = sri.pickAlgorithm(opts);
		const newSri = parse({
			algorithm,
			digest: crypto$1.createHash(algorithm).update(data).digest("base64")
		});
		const match = newSri.match(sri, opts);
		opts = opts || {};
		if (match || !opts.error) return match;
		else if (typeof opts.size === "number" && data.length !== opts.size) {
			const err = /* @__PURE__ */ new Error(`data size mismatch when checking ${sri}.\n  Wanted: ${opts.size}\n  Found: ${data.length}`);
			err.code = "EBADSIZE";
			err.found = data.length;
			err.expected = opts.size;
			err.sri = sri;
			throw err;
		} else {
			const err = /* @__PURE__ */ new Error(`Integrity checksum failed when using ${algorithm}: Wanted ${sri}, but got ${newSri}. (${data.length} bytes)`);
			err.code = "EINTEGRITY";
			err.found = newSri;
			err.expected = sri;
			err.algorithm = algorithm;
			err.sri = sri;
			throw err;
		}
	}
	module.exports.checkStream = checkStream;
	function checkStream(stream, sri, opts) {
		opts = opts || Object.create(null);
		opts.integrity = sri;
		sri = parse(sri, opts);
		if (!sri || !Object.keys(sri).length) return Promise.reject(Object.assign(/* @__PURE__ */ new Error("No valid integrity hashes to check against"), { code: "EINTEGRITY" }));
		const checker = integrityStream(opts);
		return new Promise((resolve, reject) => {
			stream.pipe(checker);
			stream.on("error", reject);
			checker.on("error", reject);
			let verified;
			checker.on("verified", (s) => {
				verified = s;
			});
			checker.on("end", () => resolve(verified));
			checker.resume();
		});
	}
	module.exports.integrityStream = integrityStream;
	function integrityStream(opts = Object.create(null)) {
		return new IntegrityStream(opts);
	}
	module.exports.create = createIntegrity;
	function createIntegrity(opts) {
		const algorithms = opts?.algorithms || [...DEFAULT_ALGORITHMS];
		const optString = getOptString(opts?.options);
		const hashes = algorithms.map(crypto$1.createHash);
		return {
			update: function(chunk, enc) {
				hashes.forEach((h) => h.update(chunk, enc));
				return this;
			},
			digest: function(enc) {
				return algorithms.reduce((acc, algo) => {
					const hash = new Hash(`${algo}-${hashes.shift().digest("base64")}${optString}`, opts);
					/* istanbul ignore else - it would be VERY strange if the hash we
					* just calculated with an algo did not have an algo or digest.
					*/
					if (hash.algorithm && hash.digest) {
						const hashAlgo = hash.algorithm;
						if (!acc[hashAlgo]) acc[hashAlgo] = [];
						acc[hashAlgo].push(hash);
					}
					return acc;
				}, new Integrity());
			}
		};
	}
	const NODE_HASHES = crypto$1.getHashes();
	const DEFAULT_PRIORITY = [
		"md5",
		"whirlpool",
		"sha1",
		"sha224",
		"sha256",
		"sha384",
		"sha512",
		"sha3",
		"sha3-256",
		"sha3-384",
		"sha3-512",
		"sha3_256",
		"sha3_384",
		"sha3_512"
	].filter((algo) => NODE_HASHES.includes(algo));
	function getPrioritizedHash(algo1, algo2) {
		return DEFAULT_PRIORITY.indexOf(algo1.toLowerCase()) >= DEFAULT_PRIORITY.indexOf(algo2.toLowerCase()) ? algo1 : algo2;
	}
}));
//#endregion
//#region node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js
var require_polyfills = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var constants = __require("constants");
	var origCwd = process.cwd;
	var cwd = null;
	var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
	process.cwd = function() {
		if (!cwd) cwd = origCwd.call(process);
		return cwd;
	};
	try {
		process.cwd();
	} catch (er) {}
	if (typeof process.chdir === "function") {
		var chdir = process.chdir;
		process.chdir = function(d) {
			cwd = null;
			chdir.call(process, d);
		};
		if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
	}
	module.exports = patch;
	function patch(fs) {
		if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) patchLchmod(fs);
		if (!fs.lutimes) patchLutimes(fs);
		fs.chown = chownFix(fs.chown);
		fs.fchown = chownFix(fs.fchown);
		fs.lchown = chownFix(fs.lchown);
		fs.chmod = chmodFix(fs.chmod);
		fs.fchmod = chmodFix(fs.fchmod);
		fs.lchmod = chmodFix(fs.lchmod);
		fs.chownSync = chownFixSync(fs.chownSync);
		fs.fchownSync = chownFixSync(fs.fchownSync);
		fs.lchownSync = chownFixSync(fs.lchownSync);
		fs.chmodSync = chmodFixSync(fs.chmodSync);
		fs.fchmodSync = chmodFixSync(fs.fchmodSync);
		fs.lchmodSync = chmodFixSync(fs.lchmodSync);
		fs.stat = statFix(fs.stat);
		fs.fstat = statFix(fs.fstat);
		fs.lstat = statFix(fs.lstat);
		fs.statSync = statFixSync(fs.statSync);
		fs.fstatSync = statFixSync(fs.fstatSync);
		fs.lstatSync = statFixSync(fs.lstatSync);
		if (fs.chmod && !fs.lchmod) {
			fs.lchmod = function(path, mode, cb) {
				if (cb) process.nextTick(cb);
			};
			fs.lchmodSync = function() {};
		}
		if (fs.chown && !fs.lchown) {
			fs.lchown = function(path, uid, gid, cb) {
				if (cb) process.nextTick(cb);
			};
			fs.lchownSync = function() {};
		}
		if (platform === "win32") fs.rename = typeof fs.rename !== "function" ? fs.rename : (function(fs$rename) {
			function rename(from, to, cb) {
				var start = Date.now();
				var backoff = 0;
				fs$rename(from, to, function CB(er) {
					if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
						setTimeout(function() {
							fs.stat(to, function(stater, st) {
								if (stater && stater.code === "ENOENT") fs$rename(from, to, CB);
								else cb(er);
							});
						}, backoff);
						if (backoff < 100) backoff += 10;
						return;
					}
					if (cb) cb(er);
				});
			}
			if (Object.setPrototypeOf) Object.setPrototypeOf(rename, fs$rename);
			return rename;
		})(fs.rename);
		fs.read = typeof fs.read !== "function" ? fs.read : (function(fs$read) {
			function read(fd, buffer, offset, length, position, callback_) {
				var callback;
				if (callback_ && typeof callback_ === "function") {
					var eagCounter = 0;
					callback = function(er, _, __) {
						if (er && er.code === "EAGAIN" && eagCounter < 10) {
							eagCounter++;
							return fs$read.call(fs, fd, buffer, offset, length, position, callback);
						}
						callback_.apply(this, arguments);
					};
				}
				return fs$read.call(fs, fd, buffer, offset, length, position, callback);
			}
			if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read);
			return read;
		})(fs.read);
		fs.readSync = typeof fs.readSync !== "function" ? fs.readSync : (function(fs$readSync) {
			return function(fd, buffer, offset, length, position) {
				var eagCounter = 0;
				while (true) try {
					return fs$readSync.call(fs, fd, buffer, offset, length, position);
				} catch (er) {
					if (er.code === "EAGAIN" && eagCounter < 10) {
						eagCounter++;
						continue;
					}
					throw er;
				}
			};
		})(fs.readSync);
		function patchLchmod(fs) {
			fs.lchmod = function(path, mode, callback) {
				fs.open(path, constants.O_WRONLY | constants.O_SYMLINK, mode, function(err, fd) {
					if (err) {
						if (callback) callback(err);
						return;
					}
					fs.fchmod(fd, mode, function(err) {
						fs.close(fd, function(err2) {
							if (callback) callback(err || err2);
						});
					});
				});
			};
			fs.lchmodSync = function(path, mode) {
				var fd = fs.openSync(path, constants.O_WRONLY | constants.O_SYMLINK, mode);
				var threw = true;
				var ret;
				try {
					ret = fs.fchmodSync(fd, mode);
					threw = false;
				} finally {
					if (threw) try {
						fs.closeSync(fd);
					} catch (er) {}
					else fs.closeSync(fd);
				}
				return ret;
			};
		}
		function patchLutimes(fs) {
			if (constants.hasOwnProperty("O_SYMLINK") && fs.futimes) {
				fs.lutimes = function(path, at, mt, cb) {
					fs.open(path, constants.O_SYMLINK, function(er, fd) {
						if (er) {
							if (cb) cb(er);
							return;
						}
						fs.futimes(fd, at, mt, function(er) {
							fs.close(fd, function(er2) {
								if (cb) cb(er || er2);
							});
						});
					});
				};
				fs.lutimesSync = function(path, at, mt) {
					var fd = fs.openSync(path, constants.O_SYMLINK);
					var ret;
					var threw = true;
					try {
						ret = fs.futimesSync(fd, at, mt);
						threw = false;
					} finally {
						if (threw) try {
							fs.closeSync(fd);
						} catch (er) {}
						else fs.closeSync(fd);
					}
					return ret;
				};
			} else if (fs.futimes) {
				fs.lutimes = function(_a, _b, _c, cb) {
					if (cb) process.nextTick(cb);
				};
				fs.lutimesSync = function() {};
			}
		}
		function chmodFix(orig) {
			if (!orig) return orig;
			return function(target, mode, cb) {
				return orig.call(fs, target, mode, function(er) {
					if (chownErOk(er)) er = null;
					if (cb) cb.apply(this, arguments);
				});
			};
		}
		function chmodFixSync(orig) {
			if (!orig) return orig;
			return function(target, mode) {
				try {
					return orig.call(fs, target, mode);
				} catch (er) {
					if (!chownErOk(er)) throw er;
				}
			};
		}
		function chownFix(orig) {
			if (!orig) return orig;
			return function(target, uid, gid, cb) {
				return orig.call(fs, target, uid, gid, function(er) {
					if (chownErOk(er)) er = null;
					if (cb) cb.apply(this, arguments);
				});
			};
		}
		function chownFixSync(orig) {
			if (!orig) return orig;
			return function(target, uid, gid) {
				try {
					return orig.call(fs, target, uid, gid);
				} catch (er) {
					if (!chownErOk(er)) throw er;
				}
			};
		}
		function statFix(orig) {
			if (!orig) return orig;
			return function(target, options, cb) {
				if (typeof options === "function") {
					cb = options;
					options = null;
				}
				function callback(er, stats) {
					if (stats) {
						if (stats.uid < 0) stats.uid += 4294967296;
						if (stats.gid < 0) stats.gid += 4294967296;
					}
					if (cb) cb.apply(this, arguments);
				}
				return options ? orig.call(fs, target, options, callback) : orig.call(fs, target, callback);
			};
		}
		function statFixSync(orig) {
			if (!orig) return orig;
			return function(target, options) {
				var stats = options ? orig.call(fs, target, options) : orig.call(fs, target);
				if (stats) {
					if (stats.uid < 0) stats.uid += 4294967296;
					if (stats.gid < 0) stats.gid += 4294967296;
				}
				return stats;
			};
		}
		function chownErOk(er) {
			if (!er) return true;
			if (er.code === "ENOSYS") return true;
			if (!process.getuid || process.getuid() !== 0) {
				if (er.code === "EINVAL" || er.code === "EPERM") return true;
			}
			return false;
		}
	}
}));
//#endregion
//#region node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Stream = __require("stream").Stream;
	module.exports = legacy;
	function legacy(fs) {
		return {
			ReadStream,
			WriteStream
		};
		function ReadStream(path, options) {
			if (!(this instanceof ReadStream)) return new ReadStream(path, options);
			Stream.call(this);
			var self = this;
			this.path = path;
			this.fd = null;
			this.readable = true;
			this.paused = false;
			this.flags = "r";
			this.mode = 438;
			this.bufferSize = 64 * 1024;
			options = options || {};
			var keys = Object.keys(options);
			for (var index = 0, length = keys.length; index < length; index++) {
				var key = keys[index];
				this[key] = options[key];
			}
			if (this.encoding) this.setEncoding(this.encoding);
			if (this.start !== void 0) {
				if ("number" !== typeof this.start) throw TypeError("start must be a Number");
				if (this.end === void 0) this.end = Infinity;
				else if ("number" !== typeof this.end) throw TypeError("end must be a Number");
				if (this.start > this.end) throw new Error("start must be <= end");
				this.pos = this.start;
			}
			if (this.fd !== null) {
				process.nextTick(function() {
					self._read();
				});
				return;
			}
			fs.open(this.path, this.flags, this.mode, function(err, fd) {
				if (err) {
					self.emit("error", err);
					self.readable = false;
					return;
				}
				self.fd = fd;
				self.emit("open", fd);
				self._read();
			});
		}
		function WriteStream(path, options) {
			if (!(this instanceof WriteStream)) return new WriteStream(path, options);
			Stream.call(this);
			this.path = path;
			this.fd = null;
			this.writable = true;
			this.flags = "w";
			this.encoding = "binary";
			this.mode = 438;
			this.bytesWritten = 0;
			options = options || {};
			var keys = Object.keys(options);
			for (var index = 0, length = keys.length; index < length; index++) {
				var key = keys[index];
				this[key] = options[key];
			}
			if (this.start !== void 0) {
				if ("number" !== typeof this.start) throw TypeError("start must be a Number");
				if (this.start < 0) throw new Error("start must be >= zero");
				this.pos = this.start;
			}
			this.busy = false;
			this._queue = [];
			if (this.fd === null) {
				this._open = fs.open;
				this._queue.push([
					this._open,
					this.path,
					this.flags,
					this.mode,
					void 0
				]);
				this.flush();
			}
		}
	}
}));
//#endregion
//#region node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js
var require_clone = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = clone;
	var getPrototypeOf = Object.getPrototypeOf || function(obj) {
		return obj.__proto__;
	};
	function clone(obj) {
		if (obj === null || typeof obj !== "object") return obj;
		if (obj instanceof Object) var copy = { __proto__: getPrototypeOf(obj) };
		else var copy = Object.create(null);
		Object.getOwnPropertyNames(obj).forEach(function(key) {
			Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
		});
		return copy;
	}
}));
//#endregion
//#region node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var fs$2 = __require("fs");
	var polyfills = require_polyfills();
	var legacy = require_legacy_streams();
	var clone = require_clone();
	var util = __require("util");
	/* istanbul ignore next - node 0.x polyfill */
	var gracefulQueue;
	var previousSymbol;
	/* istanbul ignore else - node 0.x polyfill */
	if (typeof Symbol === "function" && typeof Symbol.for === "function") {
		gracefulQueue = Symbol.for("graceful-fs.queue");
		previousSymbol = Symbol.for("graceful-fs.previous");
	} else {
		gracefulQueue = "___graceful-fs.queue";
		previousSymbol = "___graceful-fs.previous";
	}
	function noop() {}
	function publishQueue(context, queue) {
		Object.defineProperty(context, gracefulQueue, { get: function() {
			return queue;
		} });
	}
	var debug = noop;
	if (util.debuglog) debug = util.debuglog("gfs4");
	else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) debug = function() {
		var m = util.format.apply(util, arguments);
		m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
		console.error(m);
	};
	if (!fs$2[gracefulQueue]) {
		publishQueue(fs$2, global[gracefulQueue] || []);
		fs$2.close = (function(fs$close) {
			function close(fd, cb) {
				return fs$close.call(fs$2, fd, function(err) {
					if (!err) resetQueue();
					if (typeof cb === "function") cb.apply(this, arguments);
				});
			}
			Object.defineProperty(close, previousSymbol, { value: fs$close });
			return close;
		})(fs$2.close);
		fs$2.closeSync = (function(fs$closeSync) {
			function closeSync(fd) {
				fs$closeSync.apply(fs$2, arguments);
				resetQueue();
			}
			Object.defineProperty(closeSync, previousSymbol, { value: fs$closeSync });
			return closeSync;
		})(fs$2.closeSync);
		if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) process.on("exit", function() {
			debug(fs$2[gracefulQueue]);
			__require("assert").equal(fs$2[gracefulQueue].length, 0);
		});
	}
	if (!global[gracefulQueue]) publishQueue(global, fs$2[gracefulQueue]);
	module.exports = patch(clone(fs$2));
	if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs$2.__patched) {
		module.exports = patch(fs$2);
		fs$2.__patched = true;
	}
	function patch(fs) {
		polyfills(fs);
		fs.gracefulify = patch;
		fs.createReadStream = createReadStream;
		fs.createWriteStream = createWriteStream;
		var fs$readFile = fs.readFile;
		fs.readFile = readFile;
		function readFile(path, options, cb) {
			if (typeof options === "function") cb = options, options = null;
			return go$readFile(path, options, cb);
			function go$readFile(path, options, cb, startTime) {
				return fs$readFile(path, options, function(err) {
					if (err && (err.code === "EMFILE" || err.code === "ENFILE")) enqueue([
						go$readFile,
						[
							path,
							options,
							cb
						],
						err,
						startTime || Date.now(),
						Date.now()
					]);
					else if (typeof cb === "function") cb.apply(this, arguments);
				});
			}
		}
		var fs$writeFile = fs.writeFile;
		fs.writeFile = writeFile;
		function writeFile(path, data, options, cb) {
			if (typeof options === "function") cb = options, options = null;
			return go$writeFile(path, data, options, cb);
			function go$writeFile(path, data, options, cb, startTime) {
				return fs$writeFile(path, data, options, function(err) {
					if (err && (err.code === "EMFILE" || err.code === "ENFILE")) enqueue([
						go$writeFile,
						[
							path,
							data,
							options,
							cb
						],
						err,
						startTime || Date.now(),
						Date.now()
					]);
					else if (typeof cb === "function") cb.apply(this, arguments);
				});
			}
		}
		var fs$appendFile = fs.appendFile;
		if (fs$appendFile) fs.appendFile = appendFile;
		function appendFile(path, data, options, cb) {
			if (typeof options === "function") cb = options, options = null;
			return go$appendFile(path, data, options, cb);
			function go$appendFile(path, data, options, cb, startTime) {
				return fs$appendFile(path, data, options, function(err) {
					if (err && (err.code === "EMFILE" || err.code === "ENFILE")) enqueue([
						go$appendFile,
						[
							path,
							data,
							options,
							cb
						],
						err,
						startTime || Date.now(),
						Date.now()
					]);
					else if (typeof cb === "function") cb.apply(this, arguments);
				});
			}
		}
		var fs$copyFile = fs.copyFile;
		if (fs$copyFile) fs.copyFile = copyFile;
		function copyFile(src, dest, flags, cb) {
			if (typeof flags === "function") {
				cb = flags;
				flags = 0;
			}
			return go$copyFile(src, dest, flags, cb);
			function go$copyFile(src, dest, flags, cb, startTime) {
				return fs$copyFile(src, dest, flags, function(err) {
					if (err && (err.code === "EMFILE" || err.code === "ENFILE")) enqueue([
						go$copyFile,
						[
							src,
							dest,
							flags,
							cb
						],
						err,
						startTime || Date.now(),
						Date.now()
					]);
					else if (typeof cb === "function") cb.apply(this, arguments);
				});
			}
		}
		var fs$readdir = fs.readdir;
		fs.readdir = readdir;
		var noReaddirOptionVersions = /^v[0-5]\./;
		function readdir(path, options, cb) {
			if (typeof options === "function") cb = options, options = null;
			var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir(path, options, cb, startTime) {
				return fs$readdir(path, fs$readdirCallback(path, options, cb, startTime));
			} : function go$readdir(path, options, cb, startTime) {
				return fs$readdir(path, options, fs$readdirCallback(path, options, cb, startTime));
			};
			return go$readdir(path, options, cb);
			function fs$readdirCallback(path, options, cb, startTime) {
				return function(err, files) {
					if (err && (err.code === "EMFILE" || err.code === "ENFILE")) enqueue([
						go$readdir,
						[
							path,
							options,
							cb
						],
						err,
						startTime || Date.now(),
						Date.now()
					]);
					else {
						if (files && files.sort) files.sort();
						if (typeof cb === "function") cb.call(this, err, files);
					}
				};
			}
		}
		if (process.version.substr(0, 4) === "v0.8") {
			var legStreams = legacy(fs);
			ReadStream = legStreams.ReadStream;
			WriteStream = legStreams.WriteStream;
		}
		var fs$ReadStream = fs.ReadStream;
		if (fs$ReadStream) {
			ReadStream.prototype = Object.create(fs$ReadStream.prototype);
			ReadStream.prototype.open = ReadStream$open;
		}
		var fs$WriteStream = fs.WriteStream;
		if (fs$WriteStream) {
			WriteStream.prototype = Object.create(fs$WriteStream.prototype);
			WriteStream.prototype.open = WriteStream$open;
		}
		Object.defineProperty(fs, "ReadStream", {
			get: function() {
				return ReadStream;
			},
			set: function(val) {
				ReadStream = val;
			},
			enumerable: true,
			configurable: true
		});
		Object.defineProperty(fs, "WriteStream", {
			get: function() {
				return WriteStream;
			},
			set: function(val) {
				WriteStream = val;
			},
			enumerable: true,
			configurable: true
		});
		var FileReadStream = ReadStream;
		Object.defineProperty(fs, "FileReadStream", {
			get: function() {
				return FileReadStream;
			},
			set: function(val) {
				FileReadStream = val;
			},
			enumerable: true,
			configurable: true
		});
		var FileWriteStream = WriteStream;
		Object.defineProperty(fs, "FileWriteStream", {
			get: function() {
				return FileWriteStream;
			},
			set: function(val) {
				FileWriteStream = val;
			},
			enumerable: true,
			configurable: true
		});
		function ReadStream(path, options) {
			if (this instanceof ReadStream) return fs$ReadStream.apply(this, arguments), this;
			else return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
		}
		function ReadStream$open() {
			var that = this;
			open(that.path, that.flags, that.mode, function(err, fd) {
				if (err) {
					if (that.autoClose) that.destroy();
					that.emit("error", err);
				} else {
					that.fd = fd;
					that.emit("open", fd);
					that.read();
				}
			});
		}
		function WriteStream(path, options) {
			if (this instanceof WriteStream) return fs$WriteStream.apply(this, arguments), this;
			else return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
		}
		function WriteStream$open() {
			var that = this;
			open(that.path, that.flags, that.mode, function(err, fd) {
				if (err) {
					that.destroy();
					that.emit("error", err);
				} else {
					that.fd = fd;
					that.emit("open", fd);
				}
			});
		}
		function createReadStream(path, options) {
			return new fs.ReadStream(path, options);
		}
		function createWriteStream(path, options) {
			return new fs.WriteStream(path, options);
		}
		var fs$open = fs.open;
		fs.open = open;
		function open(path, flags, mode, cb) {
			if (typeof mode === "function") cb = mode, mode = null;
			return go$open(path, flags, mode, cb);
			function go$open(path, flags, mode, cb, startTime) {
				return fs$open(path, flags, mode, function(err, fd) {
					if (err && (err.code === "EMFILE" || err.code === "ENFILE")) enqueue([
						go$open,
						[
							path,
							flags,
							mode,
							cb
						],
						err,
						startTime || Date.now(),
						Date.now()
					]);
					else if (typeof cb === "function") cb.apply(this, arguments);
				});
			}
		}
		return fs;
	}
	function enqueue(elem) {
		debug("ENQUEUE", elem[0].name, elem[1]);
		fs$2[gracefulQueue].push(elem);
		retry();
	}
	var retryTimer;
	function resetQueue() {
		var now = Date.now();
		for (var i = 0; i < fs$2[gracefulQueue].length; ++i) if (fs$2[gracefulQueue][i].length > 2) {
			fs$2[gracefulQueue][i][3] = now;
			fs$2[gracefulQueue][i][4] = now;
		}
		retry();
	}
	function retry() {
		clearTimeout(retryTimer);
		retryTimer = void 0;
		if (fs$2[gracefulQueue].length === 0) return;
		var elem = fs$2[gracefulQueue].shift();
		var fn = elem[0];
		var args = elem[1];
		var err = elem[2];
		var startTime = elem[3];
		var lastTime = elem[4];
		if (startTime === void 0) {
			debug("RETRY", fn.name, args);
			fn.apply(null, args);
		} else if (Date.now() - startTime >= 6e4) {
			debug("TIMEOUT", fn.name, args);
			var cb = args.pop();
			if (typeof cb === "function") cb.call(null, err);
		} else {
			var sinceAttempt = Date.now() - lastTime;
			var sinceStart = Math.max(lastTime - startTime, 1);
			if (sinceAttempt >= Math.min(sinceStart * 1.2, 100)) {
				debug("RETRY", fn.name, args);
				fn.apply(null, args.concat([startTime]));
			} else fs$2[gracefulQueue].push(elem);
		}
		if (retryTimer === void 0) retryTimer = setTimeout(retry, 0);
	}
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+graceful-fs@1000.1.0/node_modules/@pnpm/graceful-fs/lib/index.js
var require_lib$2 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		var desc = Object.getOwnPropertyDescriptor(m, k);
		if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) desc = {
			enumerable: true,
			get: function() {
				return m[k];
			}
		};
		Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
		if (k2 === void 0) k2 = k;
		o[k2] = m[k];
	}));
	var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
		Object.defineProperty(o, "default", {
			enumerable: true,
			value: v
		});
	}) : function(o, v) {
		o["default"] = v;
	});
	var __importStar = exports && exports.__importStar || function(mod) {
		if (mod && mod.__esModule) return mod;
		var result = {};
		if (mod != null) {
			for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
		}
		__setModuleDefault(result, mod);
		return result;
	};
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	const util_1$3 = __importStar(__require("util"));
	const graceful_fs_1 = __importDefault(require_graceful_fs());
	exports.default = {
		copyFile: (0, util_1$3.promisify)(graceful_fs_1.default.copyFile),
		copyFileSync: withEagainRetry(graceful_fs_1.default.copyFileSync),
		createReadStream: graceful_fs_1.default.createReadStream,
		link: (0, util_1$3.promisify)(graceful_fs_1.default.link),
		linkSync: withEagainRetry(graceful_fs_1.default.linkSync),
		mkdir: (0, util_1$3.promisify)(graceful_fs_1.default.mkdir),
		mkdirSync: withEagainRetry(graceful_fs_1.default.mkdirSync),
		renameSync: withEagainRetry(graceful_fs_1.default.renameSync),
		readFile: (0, util_1$3.promisify)(graceful_fs_1.default.readFile),
		readFileSync: graceful_fs_1.default.readFileSync,
		readdirSync: graceful_fs_1.default.readdirSync,
		stat: (0, util_1$3.promisify)(graceful_fs_1.default.stat),
		statSync: graceful_fs_1.default.statSync,
		unlinkSync: graceful_fs_1.default.unlinkSync,
		writeFile: (0, util_1$3.promisify)(graceful_fs_1.default.writeFile),
		writeFileSync: withEagainRetry(graceful_fs_1.default.writeFileSync)
	};
	function withEagainRetry(fn, maxRetries = 15) {
		return (...args) => {
			let attempts = 0;
			while (attempts <= maxRetries) try {
				return fn(...args);
			} catch (err) {
				if (util_1$3.default.types.isNativeError(err) && "code" in err && err.code === "EAGAIN" && attempts < maxRetries) {
					attempts++;
					const delay = Math.min(Math.pow(2, attempts), 300);
					Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
					continue;
				}
				throw err;
			}
			throw new Error("Unreachable");
		};
	}
}));
//#endregion
//#region node_modules/.pnpm/is-windows@1.0.2/node_modules/is-windows/index.js
var require_is_windows = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	/*!
	* is-windows <https://github.com/jonschlinkert/is-windows>
	*
	* Copyright © 2015-2018, Jon Schlinkert.
	* Released under the MIT License.
	*/
	(function(factory) {
		if (exports && typeof exports === "object" && typeof module !== "undefined") module.exports = factory();
		else if (typeof define === "function" && define.amd) define([], factory);
		else if (typeof window !== "undefined") window.isWindows = factory();
		else if (typeof global !== "undefined") global.isWindows = factory();
		else if (typeof self !== "undefined") self.isWindows = factory();
		else this.isWindows = factory();
	})(function() {
		"use strict";
		return function isWindows() {
			return process && (process.platform === "win32" || /^(msys|cygwin)$/.test(process.env.OSTYPE));
		};
	});
}));
//#endregion
//#region node_modules/.pnpm/better-path-resolve@1.0.0/node_modules/better-path-resolve/index.js
var require_better_path_resolve = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const path$14 = __require("path");
	module.exports = require_is_windows()() ? winResolve : path$14.resolve;
	function winResolve(p) {
		if (arguments.length === 0) return path$14.resolve();
		if (typeof p !== "string") return path$14.resolve(p);
		if (p[1] === ":") {
			const cc = p[0].charCodeAt();
			if (cc < 65 || cc > 90) p = `${p[0].toUpperCase()}${p.substr(1)}`;
		}
		if (p.endsWith(":")) return p;
		return path$14.resolve(p);
	}
}));
//#endregion
//#region node_modules/.pnpm/is-subdir@1.2.0/node_modules/is-subdir/index.js
var require_is_subdir = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const betterPathResolve = require_better_path_resolve();
	const path$13 = __require("path");
	function isSubdir(parentDir, subdir) {
		const rParent = `${betterPathResolve(parentDir)}${path$13.sep}`;
		return `${betterPathResolve(subdir)}${path$13.sep}`.startsWith(rParent);
	}
	isSubdir.strict = function isSubdirStrict(parentDir, subdir) {
		const rParent = `${betterPathResolve(parentDir)}${path$13.sep}`;
		const rDir = `${betterPathResolve(subdir)}${path$13.sep}`;
		return rDir !== rParent && rDir.startsWith(rParent);
	};
	module.exports = isSubdir;
}));
//#endregion
//#region node_modules/.pnpm/strip-bom@4.0.0/node_modules/strip-bom/index.js
var require_strip_bom = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = (string) => {
		if (typeof string !== "string") throw new TypeError(`Expected a string, got ${typeof string}`);
		if (string.charCodeAt(0) === 65279) return string.slice(1);
		return string;
	};
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+store.cafs@1000.1.4/node_modules/@pnpm/store.cafs/lib/parseJson.js
var require_parseJson = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.parseJsonBufferSync = parseJsonBufferSync;
	const strip_bom_1 = __importDefault(require_strip_bom());
	function parseJsonBufferSync(buffer) {
		return JSON.parse((0, strip_bom_1.default)(buffer.toString()));
	}
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+store.cafs@1000.1.4/node_modules/@pnpm/store.cafs/lib/addFilesFromDir.js
var require_addFilesFromDir = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.addFilesFromDir = addFilesFromDir;
	const util_1$2 = __importDefault(__require("util"));
	const fs_1$2 = __importDefault(__require("fs"));
	const path_1$4 = __importDefault(__require("path"));
	const graceful_fs_1 = __importDefault(require_lib$2());
	const is_subdir_1 = __importDefault(require_is_subdir());
	const parseJson_js_1 = require_parseJson();
	function addFilesFromDir(addBuffer, dirname, opts = {}) {
		const filesIndex = {};
		let manifest;
		let files;
		const resolvedRoot = fs_1$2.default.realpathSync(dirname);
		if (opts.files) {
			files = [];
			for (const file of opts.files) {
				const absolutePath = path_1$4.default.join(dirname, file);
				const stat = getStatIfContained(absolutePath, resolvedRoot);
				if (!stat) continue;
				files.push({
					absolutePath,
					relativePath: file,
					stat
				});
			}
		} else files = findFilesInDir(dirname, resolvedRoot);
		for (const { absolutePath, relativePath, stat } of files) {
			const buffer = graceful_fs_1.default.readFileSync(absolutePath);
			if (opts.readManifest && relativePath === "package.json") manifest = (0, parseJson_js_1.parseJsonBufferSync)(buffer);
			const mode = stat.mode & 511;
			filesIndex[relativePath] = {
				mode,
				size: stat.size,
				...addBuffer(buffer, mode)
			};
		}
		return {
			manifest,
			filesIndex
		};
	}
	/**
	* Resolves a path and validates it stays within the allowed root directory.
	* If the path is a symlink, resolves it and validates the target.
	* Returns null if the path is a symlink pointing outside the root, or if target is inaccessible.
	*/
	function getStatIfContained(absolutePath, rootDir) {
		let lstat;
		try {
			lstat = fs_1$2.default.lstatSync(absolutePath);
		} catch (err) {
			if (util_1$2.default.types.isNativeError(err) && "code" in err && err.code === "ENOENT") return null;
			throw err;
		}
		if (lstat.isSymbolicLink()) return getSymlinkStatIfContained(absolutePath, rootDir)?.stat ?? null;
		return lstat;
	}
	/**
	* Validates a known symlink points within the allowed root directory.
	* Returns null if the symlink points outside the root or if target is inaccessible.
	*/
	function getSymlinkStatIfContained(absolutePath, rootDir) {
		let realPath;
		try {
			realPath = fs_1$2.default.realpathSync(absolutePath);
		} catch (err) {
			if (util_1$2.default.types.isNativeError(err) && "code" in err && err.code === "ENOENT") return null;
			throw err;
		}
		if (!(0, is_subdir_1.default)(rootDir, realPath)) return null;
		return {
			stat: fs_1$2.default.statSync(realPath),
			realPath
		};
	}
	function findFilesInDir(dir, rootDir) {
		const files = [];
		findFiles({
			filesList: files,
			rootDir,
			visited: new Set([rootDir])
		}, dir, "", rootDir);
		return files;
	}
	function findFiles(ctx, dir, relativeDir, currentRealPath) {
		const files = fs_1$2.default.readdirSync(dir, { withFileTypes: true });
		for (const file of files) {
			const relativeSubdir = `${relativeDir}${relativeDir ? "/" : ""}${file.name}`;
			const absolutePath = path_1$4.default.join(dir, file.name);
			let nextRealDir;
			if (file.isSymbolicLink()) {
				const res = getSymlinkStatIfContained(absolutePath, ctx.rootDir);
				if (!res) continue;
				if (res.stat.isDirectory()) nextRealDir = res.realPath;
				else {
					ctx.filesList.push({
						relativePath: relativeSubdir,
						absolutePath,
						stat: res.stat
					});
					continue;
				}
			} else if (file.isDirectory()) nextRealDir = path_1$4.default.join(currentRealPath, file.name);
			if (nextRealDir) {
				if (ctx.visited.has(nextRealDir)) continue;
				if (relativeDir !== "" || file.name !== "node_modules") {
					ctx.visited.add(nextRealDir);
					findFiles(ctx, absolutePath, relativeSubdir, nextRealDir);
					ctx.visited.delete(nextRealDir);
				}
				continue;
			}
			let stat;
			try {
				stat = fs_1$2.default.statSync(absolutePath);
			} catch (err) {
				if (util_1$2.default.types.isNativeError(err) && "code" in err && err.code === "ENOENT") continue;
				throw err;
			}
			ctx.filesList.push({
				relativePath: relativeSubdir,
				absolutePath,
				stat
			});
		}
	}
}));
//#endregion
//#region node_modules/.pnpm/is-gzip@2.0.0/node_modules/is-gzip/index.js
var require_is_gzip = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = (buf) => {
		if (!buf || buf.length < 3) return false;
		return buf[0] === 31 && buf[1] === 139 && buf[2] === 8;
	};
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+store.cafs@1000.1.4/node_modules/@pnpm/store.cafs/lib/parseTarball.js
var require_parseTarball = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.parseTarball = parseTarball;
	const path_1$3 = __importDefault(__require("path"));
	const ZERO = "0".charCodeAt(0);
	const FILE_TYPE_HARD_LINK = "1".charCodeAt(0);
	const FILE_TYPE_SYMLINK = "2".charCodeAt(0);
	const FILE_TYPE_DIRECTORY = "5".charCodeAt(0);
	const SPACE = " ".charCodeAt(0);
	const SLASH = "/".charCodeAt(0);
	const BACKSLASH = "\\".charCodeAt(0);
	const FILE_TYPE_PAX_HEADER = "x".charCodeAt(0);
	const FILE_TYPE_PAX_GLOBAL_HEADER = "g".charCodeAt(0);
	const FILE_TYPE_LONGLINK = "L".charCodeAt(0);
	const MODE_OFFSET = 100;
	const FILE_SIZE_OFFSET = 124;
	const CHECKSUM_OFFSET = 148;
	const FILE_TYPE_OFFSET = 156;
	const PREFIX_OFFSET = 345;
	function parseTarball(buffer) {
		const files = /* @__PURE__ */ new Map();
		let pathTrimmed = false;
		let mode = 0;
		let fileSize = 0;
		let fileType = 0;
		let prefix = "";
		let fileName = "";
		let longLinkPath = "";
		let paxHeaderPath = "";
		let paxHeaderFileSize;
		let blockBytes = 0;
		let blockStart = 0;
		while (buffer[blockStart] !== 0) {
			fileType = buffer[blockStart + FILE_TYPE_OFFSET];
			if (paxHeaderFileSize !== void 0) {
				fileSize = paxHeaderFileSize;
				paxHeaderFileSize = void 0;
			} else fileSize = parseOctal(blockStart + FILE_SIZE_OFFSET, 12);
			blockBytes = (fileSize & -512) + (fileSize & 511 ? 1024 : 512);
			const expectedCheckSum = parseOctal(blockStart + CHECKSUM_OFFSET, 8);
			const actualCheckSum = checkSum(blockStart);
			if (expectedCheckSum !== actualCheckSum) throw new Error(`Invalid checksum for TAR header at offset ${blockStart}. Expected ${expectedCheckSum}, got ${actualCheckSum}`);
			pathTrimmed = false;
			if (longLinkPath) {
				fileName = longLinkPath;
				longLinkPath = "";
			} else if (paxHeaderPath) {
				fileName = paxHeaderPath;
				paxHeaderPath = "";
			} else {
				prefix = parseString(blockStart + PREFIX_OFFSET, 155);
				if (prefix && !pathTrimmed) {
					pathTrimmed = true;
					prefix = "";
				}
				fileName = parseString(blockStart, MODE_OFFSET);
				if (prefix) fileName = `${prefix}/${fileName}`;
			}
			if (fileName.includes("./") || fileName.includes(".\\")) fileName = path_1$3.default.posix.join("/", fileName.replaceAll("\\", "/")).slice(1);
			switch (fileType) {
				case 0:
				case ZERO:
				case FILE_TYPE_HARD_LINK:
					mode = parseOctal(blockStart + MODE_OFFSET, 8);
					files.set(fileName.replaceAll("//", "/"), {
						offset: blockStart + 512,
						mode,
						size: fileSize
					});
					break;
				case FILE_TYPE_DIRECTORY:
				case FILE_TYPE_SYMLINK: break;
				case FILE_TYPE_PAX_HEADER:
					parsePaxHeader(blockStart + 512, fileSize, false);
					break;
				case FILE_TYPE_PAX_GLOBAL_HEADER:
					parsePaxHeader(blockStart + 512, fileSize, true);
					break;
				case FILE_TYPE_LONGLINK: {
					longLinkPath = buffer.toString("utf8", blockStart + 512, blockStart + 512 + fileSize).replace(/\0.*/, "");
					const slashIndex = longLinkPath.indexOf("/");
					if (slashIndex >= 0) longLinkPath = longLinkPath.slice(slashIndex + 1);
					break;
				}
				default: throw new Error(`Unsupported file type ${fileType} for file ${fileName}.`);
			}
			blockStart += blockBytes;
		}
		return {
			files,
			buffer: buffer.buffer
		};
		/**
		* Computes the checksum for the TAR header at the specified `offset`.
		* @param offset - The current offset into the tar buffer
		* @returns The header checksum
		*/
		function checkSum(offset) {
			let sum = 256;
			let i = offset;
			const checksumStart = offset + 148;
			const checksumEnd = offset + 156;
			const blockEnd = offset + 512;
			for (; i < checksumStart; i++) sum += buffer[i];
			for (i = checksumEnd; i < blockEnd; i++) sum += buffer[i];
			return sum;
		}
		/**
		* Parses a PAX header, which is a series of key/value pairs.
		*
		* @param offset - Offset into the buffer where the PAX header starts
		* @param length - Length of the PAX header, in bytes
		* @param global - Whether this is a global PAX header
		* @returns The path field, if present
		*/
		function parsePaxHeader(offset, length, global) {
			const end = offset + length;
			let i = offset;
			while (i < end) {
				const lineStart = i;
				while (i < end && buffer[i] !== SPACE) i++;
				const strLen = buffer.toString("utf-8", lineStart, i);
				const len = parseInt(strLen, 10);
				if (!len) throw new Error(`Invalid length in PAX record: ${strLen}`);
				i++;
				const lineEnd = lineStart + len;
				const record = buffer.toString("utf-8", i, lineEnd - 1);
				i = lineEnd;
				const equalSign = record.indexOf("=");
				const keyword = record.slice(0, equalSign);
				if (keyword === "path") {
					const slashIndex = record.indexOf("/", equalSign + 1);
					if (global) throw new Error(`Unexpected global PAX path: ${record}`);
					paxHeaderPath = record.slice(slashIndex >= 0 ? slashIndex + 1 : equalSign + 1);
				} else if (keyword === "size") {
					const size = parseInt(record.slice(equalSign + 1), 10);
					if (isNaN(size) || size < 0) throw new Error(`Invalid size in PAX record: ${record}`);
					if (global) throw new Error(`Unexpected global PAX file size: ${record}`);
					paxHeaderFileSize = size;
				} else continue;
			}
		}
		/**
		* Parses a UTF-8 string at the specified `offset`, up to `length` characters. If it ends early, it will be terminated by a NUL.
		* Will trim the first segment if `pathTrimmed` is currently false and the string contains a `/` or `\\`.
		*/
		function parseString(offset, length) {
			let end = offset;
			const max = length + offset;
			for (let char = buffer[end]; char !== 0 && end !== max; char = buffer[++end]) if (!pathTrimmed && (char === SLASH || char === BACKSLASH)) {
				pathTrimmed = true;
				offset = end + 1;
			}
			return buffer.toString("utf8", offset, end);
		}
		/**
		* Parses an octal number at the specified `offset`, up to `length` characters. If it ends early, it will be terminated by either
		* a NUL or a space.
		*/
		function parseOctal(offset, length) {
			const val = buffer.subarray(offset, offset + length);
			offset = 0;
			while (offset < val.length && val[offset] === SPACE) offset++;
			const end = clamp(indexOf(val, SPACE, offset, val.length), val.length, val.length);
			while (offset < end && val[offset] === 0) offset++;
			if (end === offset) return 0;
			return parseInt(val.slice(offset, end).toString(), 8);
		}
	}
	function indexOf(block, num, offset, end) {
		for (; offset < end; offset++) if (block[offset] === num) return offset;
		return end;
	}
	function clamp(index, len, defaultValue) {
		if (typeof index !== "number") return defaultValue;
		index = ~~index;
		if (index >= len) return len;
		if (index >= 0) return index;
		index += len;
		if (index >= 0) return index;
		return 0;
	}
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+store.cafs@1000.1.4/node_modules/@pnpm/store.cafs/lib/addFilesFromTarball.js
var require_addFilesFromTarball = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.addFilesFromTarball = addFilesFromTarball;
	const is_gzip_1 = __importDefault(require_is_gzip());
	const zlib_1 = __require("zlib");
	const parseJson_js_1 = require_parseJson();
	const parseTarball_js_1 = require_parseTarball();
	function addFilesFromTarball(addBufferToCafs, _ignore, tarballBuffer, readManifest) {
		const ignore = _ignore ?? (() => false);
		const tarContent = (0, is_gzip_1.default)(tarballBuffer) ? (0, zlib_1.gunzipSync)(tarballBuffer) : Buffer.isBuffer(tarballBuffer) ? tarballBuffer : Buffer.from(tarballBuffer);
		const { files } = (0, parseTarball_js_1.parseTarball)(tarContent);
		const filesIndex = {};
		let manifestBuffer;
		for (const [relativePath, { mode, offset, size }] of files) {
			if (ignore(relativePath)) continue;
			const fileBuffer = tarContent.subarray(offset, offset + size);
			if (readManifest && relativePath === "package.json") manifestBuffer = fileBuffer;
			filesIndex[relativePath] = {
				mode,
				size,
				...addBufferToCafs(fileBuffer, mode)
			};
		}
		return {
			filesIndex,
			manifest: manifestBuffer ? (0, parseJson_js_1.parseJsonBufferSync)(manifestBuffer) : void 0
		};
	}
}));
//#endregion
//#region node_modules/.pnpm/@zkochan+rimraf@3.0.2/node_modules/@zkochan/rimraf/index.js
var require_rimraf = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs$1 = __require("fs");
	module.exports = async (p) => {
		try {
			await fs$1.promises.rm(p, {
				recursive: true,
				force: true,
				maxRetries: 3
			});
		} catch (err) {
			if (err.code === "ENOENT") return;
			throw err;
		}
	};
	module.exports.sync = (p) => {
		try {
			fs$1.rmSync(p, {
				recursive: true,
				force: true,
				maxRetries: 3
			});
		} catch (err) {
			if (err.code === "ENOENT") return;
			throw err;
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+store.cafs@1000.1.4/node_modules/@pnpm/store.cafs/lib/getFilePathInCafs.js
var require_getFilePathInCafs = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.modeIsExecutable = void 0;
	exports.getFilePathByModeInCafs = getFilePathByModeInCafs;
	exports.getIndexFilePathInCafs = getIndexFilePathInCafs;
	exports.contentPathFromHex = contentPathFromHex;
	const path_1$2 = __importDefault(__require("path"));
	const ssri_1 = __importDefault(require_lib$3());
	/**
	* Checks if a file mode has any executable permissions set.
	*
	* This function performs a bitwise check to determine if at least one of the
	* executable bits (owner, group, or others) is set in the file mode.
	*
	* The bit mask `0o111` corresponds to the executable bits for the owner (0o100),
	* group (0o010), and others (0o001). If any of these bits are set, the file
	* is considered executable.
	*
	* @param {number} mode - The file mode (permission bits) to check.
	* @returns {boolean} - Returns true if any of the executable bits are set, false otherwise.
	*/
	const modeIsExecutable = (mode) => (mode & 73) !== 0;
	exports.modeIsExecutable = modeIsExecutable;
	function getFilePathByModeInCafs(storeDir, integrity, mode) {
		const fileType = (0, exports.modeIsExecutable)(mode) ? "exec" : "nonexec";
		return path_1$2.default.join(storeDir, contentPathFromIntegrity(integrity, fileType));
	}
	function getIndexFilePathInCafs(storeDir, integrity, pkgId) {
		const hex = ssri_1.default.parse(integrity, { single: true }).hexDigest().substring(0, 64);
		return path_1$2.default.join(storeDir, `index/${path_1$2.default.join(hex.slice(0, 2), hex.slice(2))}-${pkgId.replace(/[\\/:*?"<>|]/g, "+")}.json`);
	}
	function contentPathFromIntegrity(integrity, fileType) {
		return contentPathFromHex(fileType, ssri_1.default.parse(integrity, { single: true }).hexDigest());
	}
	function contentPathFromHex(fileType, hex) {
		const p = path_1$2.default.join("files", hex.slice(0, 2), hex.slice(2));
		switch (fileType) {
			case "exec": return `${p}-exec`;
			case "nonexec": return p;
			case "index": return `${p}-index.json`;
		}
	}
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+store.cafs@1000.1.4/node_modules/@pnpm/store.cafs/lib/checkPkgFilesIntegrity.js
var require_checkPkgFilesIntegrity = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.checkPkgFilesIntegrity = checkPkgFilesIntegrity;
	exports.verifyFileIntegrity = verifyFileIntegrity;
	const fs_1$1 = __importDefault(__require("fs"));
	const util_1$1 = __importDefault(__require("util"));
	const graceful_fs_1 = __importDefault(require_lib$2());
	const rimraf_1 = __importDefault(require_rimraf());
	const ssri_1 = __importDefault(require_lib$3());
	const getFilePathInCafs_js_1 = require_getFilePathInCafs();
	const parseJson_js_1 = require_parseJson();
	global["verifiedFileIntegrity"] = 0;
	function checkPkgFilesIntegrity(storeDir, pkgIndex, readManifest) {
		const verifiedFilesCache = /* @__PURE__ */ new Set();
		const _checkFilesIntegrity = checkFilesIntegrity.bind(null, verifiedFilesCache, storeDir);
		const verified = _checkFilesIntegrity(pkgIndex.files, readManifest);
		if (!verified) return { passed: false };
		if (pkgIndex.sideEffects) {
			for (const [sideEffectName, { added }] of Object.entries(pkgIndex.sideEffects)) if (added) {
				const { passed } = _checkFilesIntegrity(added);
				if (!passed) delete pkgIndex.sideEffects[sideEffectName];
			}
		}
		return verified;
	}
	function checkFilesIntegrity(verifiedFilesCache, storeDir, files, readManifest) {
		let allVerified = true;
		let manifest;
		for (const [f, fstat] of Object.entries(files)) {
			if (!fstat.integrity) throw new Error(`Integrity checksum is missing for ${f}`);
			const filename = (0, getFilePathInCafs_js_1.getFilePathByModeInCafs)(storeDir, fstat.integrity, fstat.mode);
			const readFile = readManifest && f === "package.json";
			if (!readFile && verifiedFilesCache.has(filename)) continue;
			const verifyResult = verifyFile(filename, fstat, readFile);
			if (readFile) manifest = verifyResult.manifest;
			if (verifyResult.passed) verifiedFilesCache.add(filename);
			else allVerified = false;
		}
		return {
			passed: allVerified,
			manifest
		};
	}
	function verifyFile(filename, fstat, readManifest) {
		const currentFile = checkFile(filename, fstat.checkedAt);
		if (currentFile == null) return { passed: false };
		if (currentFile.isModified) {
			if (currentFile.size !== fstat.size) {
				rimraf_1.default.sync(filename);
				return { passed: false };
			}
			return verifyFileIntegrity(filename, fstat, readManifest);
		}
		if (readManifest) return {
			passed: true,
			manifest: (0, parseJson_js_1.parseJsonBufferSync)(graceful_fs_1.default.readFileSync(filename))
		};
		return { passed: true };
	}
	function verifyFileIntegrity(filename, expectedFile, readManifest) {
		global["verifiedFileIntegrity"]++;
		try {
			const data = graceful_fs_1.default.readFileSync(filename);
			const passed = Boolean(ssri_1.default.checkData(data, expectedFile.integrity));
			if (!passed) {
				graceful_fs_1.default.unlinkSync(filename);
				return { passed };
			} else if (readManifest) return {
				passed,
				manifest: (0, parseJson_js_1.parseJsonBufferSync)(data)
			};
			return { passed };
		} catch (err) {
			switch (util_1$1.default.types.isNativeError(err) && "code" in err && err.code) {
				case "ENOENT": return { passed: false };
				case "EINTEGRITY":
					graceful_fs_1.default.unlinkSync(filename);
					return { passed: false };
			}
			throw err;
		}
	}
	function checkFile(filename, checkedAt) {
		try {
			const { mtimeMs, size } = fs_1$1.default.statSync(filename);
			return {
				isModified: mtimeMs - (checkedAt ?? 0) > 100,
				size
			};
		} catch (err) {
			if (util_1$1.default.types.isNativeError(err) && "code" in err && err.code === "ENOENT") return null;
			throw err;
		}
	}
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+store.cafs@1000.1.4/node_modules/@pnpm/store.cafs/lib/readManifestFromStore.js
var require_readManifestFromStore = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.readManifestFromStore = readManifestFromStore;
	const graceful_fs_1 = __importDefault(require_lib$2());
	const getFilePathInCafs_js_1 = require_getFilePathInCafs();
	const parseJson_js_1 = require_parseJson();
	function readManifestFromStore(storeDir, pkgIndex) {
		const pkg = pkgIndex.files["package.json"];
		if (pkg) {
			const fileName = (0, getFilePathInCafs_js_1.getFilePathByModeInCafs)(storeDir, pkg.integrity, pkg.mode);
			return (0, parseJson_js_1.parseJsonBufferSync)(graceful_fs_1.default.readFileSync(fileName));
		}
	}
}));
//#endregion
//#region node_modules/.pnpm/universalify@2.0.1/node_modules/universalify/index.js
var require_universalify = /* @__PURE__ */ __commonJSMin(((exports) => {
	exports.fromCallback = function(fn) {
		return Object.defineProperty(function(...args) {
			if (typeof args[args.length - 1] === "function") fn.apply(this, args);
			else return new Promise((resolve, reject) => {
				args.push((err, res) => err != null ? reject(err) : resolve(res));
				fn.apply(this, args);
			});
		}, "name", { value: fn.name });
	};
	exports.fromPromise = function(fn) {
		return Object.defineProperty(function(...args) {
			const cb = args[args.length - 1];
			if (typeof cb !== "function") return fn.apply(this, args);
			else {
				args.pop();
				fn.apply(this, args).then((r) => cb(null, r), cb);
			}
		}, "name", { value: fn.name });
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/fs/index.js
var require_fs = /* @__PURE__ */ __commonJSMin(((exports) => {
	const u = require_universalify().fromCallback;
	const fs = require_graceful_fs();
	const api = [
		"access",
		"appendFile",
		"chmod",
		"chown",
		"close",
		"copyFile",
		"cp",
		"fchmod",
		"fchown",
		"fdatasync",
		"fstat",
		"fsync",
		"ftruncate",
		"futimes",
		"glob",
		"lchmod",
		"lchown",
		"lutimes",
		"link",
		"lstat",
		"mkdir",
		"mkdtemp",
		"open",
		"opendir",
		"readdir",
		"readFile",
		"readlink",
		"realpath",
		"rename",
		"rm",
		"rmdir",
		"stat",
		"statfs",
		"symlink",
		"truncate",
		"unlink",
		"utimes",
		"writeFile"
	].filter((key) => {
		return typeof fs[key] === "function";
	});
	Object.assign(exports, fs);
	api.forEach((method) => {
		exports[method] = u(fs[method]);
	});
	exports.exists = function(filename, callback) {
		if (typeof callback === "function") return fs.exists(filename, callback);
		return new Promise((resolve) => {
			return fs.exists(filename, resolve);
		});
	};
	exports.read = function(fd, buffer, offset, length, position, callback) {
		if (typeof callback === "function") return fs.read(fd, buffer, offset, length, position, callback);
		return new Promise((resolve, reject) => {
			fs.read(fd, buffer, offset, length, position, (err, bytesRead, buffer) => {
				if (err) return reject(err);
				resolve({
					bytesRead,
					buffer
				});
			});
		});
	};
	exports.write = function(fd, buffer, ...args) {
		if (typeof args[args.length - 1] === "function") return fs.write(fd, buffer, ...args);
		return new Promise((resolve, reject) => {
			fs.write(fd, buffer, ...args, (err, bytesWritten, buffer) => {
				if (err) return reject(err);
				resolve({
					bytesWritten,
					buffer
				});
			});
		});
	};
	exports.readv = function(fd, buffers, ...args) {
		if (typeof args[args.length - 1] === "function") return fs.readv(fd, buffers, ...args);
		return new Promise((resolve, reject) => {
			fs.readv(fd, buffers, ...args, (err, bytesRead, buffers) => {
				if (err) return reject(err);
				resolve({
					bytesRead,
					buffers
				});
			});
		});
	};
	exports.writev = function(fd, buffers, ...args) {
		if (typeof args[args.length - 1] === "function") return fs.writev(fd, buffers, ...args);
		return new Promise((resolve, reject) => {
			fs.writev(fd, buffers, ...args, (err, bytesWritten, buffers) => {
				if (err) return reject(err);
				resolve({
					bytesWritten,
					buffers
				});
			});
		});
	};
	if (typeof fs.realpath.native === "function") exports.realpath.native = u(fs.realpath.native);
	else process.emitWarning("fs.realpath.native is not a function. Is fs being monkey-patched?", "Warning", "fs-extra-WARN0003");
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/mkdirs/utils.js
var require_utils$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const path$12 = __require("path");
	module.exports.checkPath = function checkPath(pth) {
		if (process.platform === "win32") {
			if (/[<>:"|?*]/.test(pth.replace(path$12.parse(pth).root, ""))) {
				const error = /* @__PURE__ */ new Error(`Path contains invalid characters: ${pth}`);
				error.code = "EINVAL";
				throw error;
			}
		}
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/mkdirs/make-dir.js
var require_make_dir = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs = require_fs();
	const { checkPath } = require_utils$1();
	const getMode = (options) => {
		const defaults = { mode: 511 };
		if (typeof options === "number") return options;
		return {
			...defaults,
			...options
		}.mode;
	};
	module.exports.makeDir = async (dir, options) => {
		checkPath(dir);
		return fs.mkdir(dir, {
			mode: getMode(options),
			recursive: true
		});
	};
	module.exports.makeDirSync = (dir, options) => {
		checkPath(dir);
		return fs.mkdirSync(dir, {
			mode: getMode(options),
			recursive: true
		});
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/mkdirs/index.js
var require_mkdirs = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const u = require_universalify().fromPromise;
	const { makeDir: _makeDir, makeDirSync } = require_make_dir();
	const makeDir = u(_makeDir);
	module.exports = {
		mkdirs: makeDir,
		mkdirsSync: makeDirSync,
		mkdirp: makeDir,
		mkdirpSync: makeDirSync,
		ensureDir: makeDir,
		ensureDirSync: makeDirSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/path-exists/index.js
var require_path_exists = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const u = require_universalify().fromPromise;
	const fs = require_fs();
	function pathExists(path) {
		return fs.access(path).then(() => true).catch(() => false);
	}
	module.exports = {
		pathExists: u(pathExists),
		pathExistsSync: fs.existsSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/util/utimes.js
var require_utimes = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs = require_fs();
	const u = require_universalify().fromPromise;
	async function utimesMillis(path, atime, mtime) {
		const fd = await fs.open(path, "r+");
		let closeErr = null;
		try {
			await fs.futimes(fd, atime, mtime);
		} finally {
			try {
				await fs.close(fd);
			} catch (e) {
				closeErr = e;
			}
		}
		if (closeErr) throw closeErr;
	}
	function utimesMillisSync(path, atime, mtime) {
		const fd = fs.openSync(path, "r+");
		fs.futimesSync(fd, atime, mtime);
		return fs.closeSync(fd);
	}
	module.exports = {
		utimesMillis: u(utimesMillis),
		utimesMillisSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/util/stat.js
var require_stat = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs = require_fs();
	const path$11 = __require("path");
	const u = require_universalify().fromPromise;
	function getStats(src, dest, opts) {
		const statFunc = opts.dereference ? (file) => fs.stat(file, { bigint: true }) : (file) => fs.lstat(file, { bigint: true });
		return Promise.all([statFunc(src), statFunc(dest).catch((err) => {
			if (err.code === "ENOENT") return null;
			throw err;
		})]).then(([srcStat, destStat]) => ({
			srcStat,
			destStat
		}));
	}
	function getStatsSync(src, dest, opts) {
		let destStat;
		const statFunc = opts.dereference ? (file) => fs.statSync(file, { bigint: true }) : (file) => fs.lstatSync(file, { bigint: true });
		const srcStat = statFunc(src);
		try {
			destStat = statFunc(dest);
		} catch (err) {
			if (err.code === "ENOENT") return {
				srcStat,
				destStat: null
			};
			throw err;
		}
		return {
			srcStat,
			destStat
		};
	}
	async function checkPaths(src, dest, funcName, opts) {
		const { srcStat, destStat } = await getStats(src, dest, opts);
		if (destStat) {
			if (areIdentical(srcStat, destStat)) {
				const srcBaseName = path$11.basename(src);
				const destBaseName = path$11.basename(dest);
				if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) return {
					srcStat,
					destStat,
					isChangingCase: true
				};
				throw new Error("Source and destination must not be the same.");
			}
			if (srcStat.isDirectory() && !destStat.isDirectory()) throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
			if (!srcStat.isDirectory() && destStat.isDirectory()) throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src}'.`);
		}
		if (srcStat.isDirectory() && isSrcSubdir(src, dest)) throw new Error(errMsg(src, dest, funcName));
		return {
			srcStat,
			destStat
		};
	}
	function checkPathsSync(src, dest, funcName, opts) {
		const { srcStat, destStat } = getStatsSync(src, dest, opts);
		if (destStat) {
			if (areIdentical(srcStat, destStat)) {
				const srcBaseName = path$11.basename(src);
				const destBaseName = path$11.basename(dest);
				if (funcName === "move" && srcBaseName !== destBaseName && srcBaseName.toLowerCase() === destBaseName.toLowerCase()) return {
					srcStat,
					destStat,
					isChangingCase: true
				};
				throw new Error("Source and destination must not be the same.");
			}
			if (srcStat.isDirectory() && !destStat.isDirectory()) throw new Error(`Cannot overwrite non-directory '${dest}' with directory '${src}'.`);
			if (!srcStat.isDirectory() && destStat.isDirectory()) throw new Error(`Cannot overwrite directory '${dest}' with non-directory '${src}'.`);
		}
		if (srcStat.isDirectory() && isSrcSubdir(src, dest)) throw new Error(errMsg(src, dest, funcName));
		return {
			srcStat,
			destStat
		};
	}
	async function checkParentPaths(src, srcStat, dest, funcName) {
		const srcParent = path$11.resolve(path$11.dirname(src));
		const destParent = path$11.resolve(path$11.dirname(dest));
		if (destParent === srcParent || destParent === path$11.parse(destParent).root) return;
		let destStat;
		try {
			destStat = await fs.stat(destParent, { bigint: true });
		} catch (err) {
			if (err.code === "ENOENT") return;
			throw err;
		}
		if (areIdentical(srcStat, destStat)) throw new Error(errMsg(src, dest, funcName));
		return checkParentPaths(src, srcStat, destParent, funcName);
	}
	function checkParentPathsSync(src, srcStat, dest, funcName) {
		const srcParent = path$11.resolve(path$11.dirname(src));
		const destParent = path$11.resolve(path$11.dirname(dest));
		if (destParent === srcParent || destParent === path$11.parse(destParent).root) return;
		let destStat;
		try {
			destStat = fs.statSync(destParent, { bigint: true });
		} catch (err) {
			if (err.code === "ENOENT") return;
			throw err;
		}
		if (areIdentical(srcStat, destStat)) throw new Error(errMsg(src, dest, funcName));
		return checkParentPathsSync(src, srcStat, destParent, funcName);
	}
	function areIdentical(srcStat, destStat) {
		return destStat.ino && destStat.dev && destStat.ino === srcStat.ino && destStat.dev === srcStat.dev;
	}
	function isSrcSubdir(src, dest) {
		const srcArr = path$11.resolve(src).split(path$11.sep).filter((i) => i);
		const destArr = path$11.resolve(dest).split(path$11.sep).filter((i) => i);
		return srcArr.every((cur, i) => destArr[i] === cur);
	}
	function errMsg(src, dest, funcName) {
		return `Cannot ${funcName} '${src}' to a subdirectory of itself, '${dest}'.`;
	}
	module.exports = {
		checkPaths: u(checkPaths),
		checkPathsSync,
		checkParentPaths: u(checkParentPaths),
		checkParentPathsSync,
		isSrcSubdir,
		areIdentical
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/copy/copy.js
var require_copy$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs = require_fs();
	const path$10 = __require("path");
	const { mkdirs } = require_mkdirs();
	const { pathExists } = require_path_exists();
	const { utimesMillis } = require_utimes();
	const stat = require_stat();
	async function copy(src, dest, opts = {}) {
		if (typeof opts === "function") opts = { filter: opts };
		opts.clobber = "clobber" in opts ? !!opts.clobber : true;
		opts.overwrite = "overwrite" in opts ? !!opts.overwrite : opts.clobber;
		if (opts.preserveTimestamps && process.arch === "ia32") process.emitWarning("Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269", "Warning", "fs-extra-WARN0001");
		const { srcStat, destStat } = await stat.checkPaths(src, dest, "copy", opts);
		await stat.checkParentPaths(src, srcStat, dest, "copy");
		if (!await runFilter(src, dest, opts)) return;
		const destParent = path$10.dirname(dest);
		if (!await pathExists(destParent)) await mkdirs(destParent);
		await getStatsAndPerformCopy(destStat, src, dest, opts);
	}
	async function runFilter(src, dest, opts) {
		if (!opts.filter) return true;
		return opts.filter(src, dest);
	}
	async function getStatsAndPerformCopy(destStat, src, dest, opts) {
		const srcStat = await (opts.dereference ? fs.stat : fs.lstat)(src);
		if (srcStat.isDirectory()) return onDir(srcStat, destStat, src, dest, opts);
		if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src, dest, opts);
		if (srcStat.isSymbolicLink()) return onLink(destStat, src, dest, opts);
		if (srcStat.isSocket()) throw new Error(`Cannot copy a socket file: ${src}`);
		if (srcStat.isFIFO()) throw new Error(`Cannot copy a FIFO pipe: ${src}`);
		throw new Error(`Unknown file: ${src}`);
	}
	async function onFile(srcStat, destStat, src, dest, opts) {
		if (!destStat) return copyFile(srcStat, src, dest, opts);
		if (opts.overwrite) {
			await fs.unlink(dest);
			return copyFile(srcStat, src, dest, opts);
		}
		if (opts.errorOnExist) throw new Error(`'${dest}' already exists`);
	}
	async function copyFile(srcStat, src, dest, opts) {
		await fs.copyFile(src, dest);
		if (opts.preserveTimestamps) {
			if (fileIsNotWritable(srcStat.mode)) await makeFileWritable(dest, srcStat.mode);
			const updatedSrcStat = await fs.stat(src);
			await utimesMillis(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
		}
		return fs.chmod(dest, srcStat.mode);
	}
	function fileIsNotWritable(srcMode) {
		return (srcMode & 128) === 0;
	}
	function makeFileWritable(dest, srcMode) {
		return fs.chmod(dest, srcMode | 128);
	}
	async function onDir(srcStat, destStat, src, dest, opts) {
		if (!destStat) await fs.mkdir(dest);
		const promises = [];
		for await (const item of await fs.opendir(src)) {
			const srcItem = path$10.join(src, item.name);
			const destItem = path$10.join(dest, item.name);
			promises.push(runFilter(srcItem, destItem, opts).then((include) => {
				if (include) return stat.checkPaths(srcItem, destItem, "copy", opts).then(({ destStat }) => {
					return getStatsAndPerformCopy(destStat, srcItem, destItem, opts);
				});
			}));
		}
		await Promise.all(promises);
		if (!destStat) await fs.chmod(dest, srcStat.mode);
	}
	async function onLink(destStat, src, dest, opts) {
		let resolvedSrc = await fs.readlink(src);
		if (opts.dereference) resolvedSrc = path$10.resolve(process.cwd(), resolvedSrc);
		if (!destStat) return fs.symlink(resolvedSrc, dest);
		let resolvedDest = null;
		try {
			resolvedDest = await fs.readlink(dest);
		} catch (e) {
			if (e.code === "EINVAL" || e.code === "UNKNOWN") return fs.symlink(resolvedSrc, dest);
			throw e;
		}
		if (opts.dereference) resolvedDest = path$10.resolve(process.cwd(), resolvedDest);
		if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
		if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
		await fs.unlink(dest);
		return fs.symlink(resolvedSrc, dest);
	}
	module.exports = copy;
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/copy/copy-sync.js
var require_copy_sync = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs = require_graceful_fs();
	const path$9 = __require("path");
	const mkdirsSync = require_mkdirs().mkdirsSync;
	const utimesMillisSync = require_utimes().utimesMillisSync;
	const stat = require_stat();
	function copySync(src, dest, opts) {
		if (typeof opts === "function") opts = { filter: opts };
		opts = opts || {};
		opts.clobber = "clobber" in opts ? !!opts.clobber : true;
		opts.overwrite = "overwrite" in opts ? !!opts.overwrite : opts.clobber;
		if (opts.preserveTimestamps && process.arch === "ia32") process.emitWarning("Using the preserveTimestamps option in 32-bit node is not recommended;\n\n	see https://github.com/jprichardson/node-fs-extra/issues/269", "Warning", "fs-extra-WARN0002");
		const { srcStat, destStat } = stat.checkPathsSync(src, dest, "copy", opts);
		stat.checkParentPathsSync(src, srcStat, dest, "copy");
		if (opts.filter && !opts.filter(src, dest)) return;
		const destParent = path$9.dirname(dest);
		if (!fs.existsSync(destParent)) mkdirsSync(destParent);
		return getStats(destStat, src, dest, opts);
	}
	function getStats(destStat, src, dest, opts) {
		const srcStat = (opts.dereference ? fs.statSync : fs.lstatSync)(src);
		if (srcStat.isDirectory()) return onDir(srcStat, destStat, src, dest, opts);
		else if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) return onFile(srcStat, destStat, src, dest, opts);
		else if (srcStat.isSymbolicLink()) return onLink(destStat, src, dest, opts);
		else if (srcStat.isSocket()) throw new Error(`Cannot copy a socket file: ${src}`);
		else if (srcStat.isFIFO()) throw new Error(`Cannot copy a FIFO pipe: ${src}`);
		throw new Error(`Unknown file: ${src}`);
	}
	function onFile(srcStat, destStat, src, dest, opts) {
		if (!destStat) return copyFile(srcStat, src, dest, opts);
		return mayCopyFile(srcStat, src, dest, opts);
	}
	function mayCopyFile(srcStat, src, dest, opts) {
		if (opts.overwrite) {
			fs.unlinkSync(dest);
			return copyFile(srcStat, src, dest, opts);
		} else if (opts.errorOnExist) throw new Error(`'${dest}' already exists`);
	}
	function copyFile(srcStat, src, dest, opts) {
		fs.copyFileSync(src, dest);
		if (opts.preserveTimestamps) handleTimestamps(srcStat.mode, src, dest);
		return setDestMode(dest, srcStat.mode);
	}
	function handleTimestamps(srcMode, src, dest) {
		if (fileIsNotWritable(srcMode)) makeFileWritable(dest, srcMode);
		return setDestTimestamps(src, dest);
	}
	function fileIsNotWritable(srcMode) {
		return (srcMode & 128) === 0;
	}
	function makeFileWritable(dest, srcMode) {
		return setDestMode(dest, srcMode | 128);
	}
	function setDestMode(dest, srcMode) {
		return fs.chmodSync(dest, srcMode);
	}
	function setDestTimestamps(src, dest) {
		const updatedSrcStat = fs.statSync(src);
		return utimesMillisSync(dest, updatedSrcStat.atime, updatedSrcStat.mtime);
	}
	function onDir(srcStat, destStat, src, dest, opts) {
		if (!destStat) return mkDirAndCopy(srcStat.mode, src, dest, opts);
		return copyDir(src, dest, opts);
	}
	function mkDirAndCopy(srcMode, src, dest, opts) {
		fs.mkdirSync(dest);
		copyDir(src, dest, opts);
		return setDestMode(dest, srcMode);
	}
	function copyDir(src, dest, opts) {
		const dir = fs.opendirSync(src);
		try {
			let dirent;
			while ((dirent = dir.readSync()) !== null) copyDirItem(dirent.name, src, dest, opts);
		} finally {
			dir.closeSync();
		}
	}
	function copyDirItem(item, src, dest, opts) {
		const srcItem = path$9.join(src, item);
		const destItem = path$9.join(dest, item);
		if (opts.filter && !opts.filter(srcItem, destItem)) return;
		const { destStat } = stat.checkPathsSync(srcItem, destItem, "copy", opts);
		return getStats(destStat, srcItem, destItem, opts);
	}
	function onLink(destStat, src, dest, opts) {
		let resolvedSrc = fs.readlinkSync(src);
		if (opts.dereference) resolvedSrc = path$9.resolve(process.cwd(), resolvedSrc);
		if (!destStat) return fs.symlinkSync(resolvedSrc, dest);
		else {
			let resolvedDest;
			try {
				resolvedDest = fs.readlinkSync(dest);
			} catch (err) {
				if (err.code === "EINVAL" || err.code === "UNKNOWN") return fs.symlinkSync(resolvedSrc, dest);
				throw err;
			}
			if (opts.dereference) resolvedDest = path$9.resolve(process.cwd(), resolvedDest);
			if (stat.isSrcSubdir(resolvedSrc, resolvedDest)) throw new Error(`Cannot copy '${resolvedSrc}' to a subdirectory of itself, '${resolvedDest}'.`);
			if (stat.isSrcSubdir(resolvedDest, resolvedSrc)) throw new Error(`Cannot overwrite '${resolvedDest}' with '${resolvedSrc}'.`);
			return copyLink(resolvedSrc, dest);
		}
	}
	function copyLink(resolvedSrc, dest) {
		fs.unlinkSync(dest);
		return fs.symlinkSync(resolvedSrc, dest);
	}
	module.exports = copySync;
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/copy/index.js
var require_copy = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const u = require_universalify().fromPromise;
	module.exports = {
		copy: u(require_copy$1()),
		copySync: require_copy_sync()
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/remove/index.js
var require_remove = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs = require_graceful_fs();
	const u = require_universalify().fromCallback;
	function remove(path, callback) {
		fs.rm(path, {
			recursive: true,
			force: true
		}, callback);
	}
	function removeSync(path) {
		fs.rmSync(path, {
			recursive: true,
			force: true
		});
	}
	module.exports = {
		remove: u(remove),
		removeSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/empty/index.js
var require_empty = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const u = require_universalify().fromPromise;
	const fs = require_fs();
	const path$8 = __require("path");
	const mkdir = require_mkdirs();
	const remove = require_remove();
	const emptyDir = u(async function emptyDir(dir) {
		let items;
		try {
			items = await fs.readdir(dir);
		} catch {
			return mkdir.mkdirs(dir);
		}
		return Promise.all(items.map((item) => remove.remove(path$8.join(dir, item))));
	});
	function emptyDirSync(dir) {
		let items;
		try {
			items = fs.readdirSync(dir);
		} catch {
			return mkdir.mkdirsSync(dir);
		}
		items.forEach((item) => {
			item = path$8.join(dir, item);
			remove.removeSync(item);
		});
	}
	module.exports = {
		emptyDirSync,
		emptydirSync: emptyDirSync,
		emptyDir,
		emptydir: emptyDir
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/ensure/file.js
var require_file = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const u = require_universalify().fromPromise;
	const path$7 = __require("path");
	const fs = require_fs();
	const mkdir = require_mkdirs();
	async function createFile(file) {
		let stats;
		try {
			stats = await fs.stat(file);
		} catch {}
		if (stats && stats.isFile()) return;
		const dir = path$7.dirname(file);
		let dirStats = null;
		try {
			dirStats = await fs.stat(dir);
		} catch (err) {
			if (err.code === "ENOENT") {
				await mkdir.mkdirs(dir);
				await fs.writeFile(file, "");
				return;
			} else throw err;
		}
		if (dirStats.isDirectory()) await fs.writeFile(file, "");
		else await fs.readdir(dir);
	}
	function createFileSync(file) {
		let stats;
		try {
			stats = fs.statSync(file);
		} catch {}
		if (stats && stats.isFile()) return;
		const dir = path$7.dirname(file);
		try {
			if (!fs.statSync(dir).isDirectory()) fs.readdirSync(dir);
		} catch (err) {
			if (err && err.code === "ENOENT") mkdir.mkdirsSync(dir);
			else throw err;
		}
		fs.writeFileSync(file, "");
	}
	module.exports = {
		createFile: u(createFile),
		createFileSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/ensure/link.js
var require_link = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const u = require_universalify().fromPromise;
	const path$6 = __require("path");
	const fs = require_fs();
	const mkdir = require_mkdirs();
	const { pathExists } = require_path_exists();
	const { areIdentical } = require_stat();
	async function createLink(srcpath, dstpath) {
		let dstStat;
		try {
			dstStat = await fs.lstat(dstpath);
		} catch {}
		let srcStat;
		try {
			srcStat = await fs.lstat(srcpath);
		} catch (err) {
			err.message = err.message.replace("lstat", "ensureLink");
			throw err;
		}
		if (dstStat && areIdentical(srcStat, dstStat)) return;
		const dir = path$6.dirname(dstpath);
		if (!await pathExists(dir)) await mkdir.mkdirs(dir);
		await fs.link(srcpath, dstpath);
	}
	function createLinkSync(srcpath, dstpath) {
		let dstStat;
		try {
			dstStat = fs.lstatSync(dstpath);
		} catch {}
		try {
			const srcStat = fs.lstatSync(srcpath);
			if (dstStat && areIdentical(srcStat, dstStat)) return;
		} catch (err) {
			err.message = err.message.replace("lstat", "ensureLink");
			throw err;
		}
		const dir = path$6.dirname(dstpath);
		if (fs.existsSync(dir)) return fs.linkSync(srcpath, dstpath);
		mkdir.mkdirsSync(dir);
		return fs.linkSync(srcpath, dstpath);
	}
	module.exports = {
		createLink: u(createLink),
		createLinkSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/ensure/symlink-paths.js
var require_symlink_paths = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const path$5 = __require("path");
	const fs = require_fs();
	const { pathExists } = require_path_exists();
	const u = require_universalify().fromPromise;
	/**
	* Function that returns two types of paths, one relative to symlink, and one
	* relative to the current working directory. Checks if path is absolute or
	* relative. If the path is relative, this function checks if the path is
	* relative to symlink or relative to current working directory. This is an
	* initiative to find a smarter `srcpath` to supply when building symlinks.
	* This allows you to determine which path to use out of one of three possible
	* types of source paths. The first is an absolute path. This is detected by
	* `path.isAbsolute()`. When an absolute path is provided, it is checked to
	* see if it exists. If it does it's used, if not an error is returned
	* (callback)/ thrown (sync). The other two options for `srcpath` are a
	* relative url. By default Node's `fs.symlink` works by creating a symlink
	* using `dstpath` and expects the `srcpath` to be relative to the newly
	* created symlink. If you provide a `srcpath` that does not exist on the file
	* system it results in a broken symlink. To minimize this, the function
	* checks to see if the 'relative to symlink' source file exists, and if it
	* does it will use it. If it does not, it checks if there's a file that
	* exists that is relative to the current working directory, if does its used.
	* This preserves the expectations of the original fs.symlink spec and adds
	* the ability to pass in `relative to current working direcotry` paths.
	*/
	async function symlinkPaths(srcpath, dstpath) {
		if (path$5.isAbsolute(srcpath)) {
			try {
				await fs.lstat(srcpath);
			} catch (err) {
				err.message = err.message.replace("lstat", "ensureSymlink");
				throw err;
			}
			return {
				toCwd: srcpath,
				toDst: srcpath
			};
		}
		const dstdir = path$5.dirname(dstpath);
		const relativeToDst = path$5.join(dstdir, srcpath);
		if (await pathExists(relativeToDst)) return {
			toCwd: relativeToDst,
			toDst: srcpath
		};
		try {
			await fs.lstat(srcpath);
		} catch (err) {
			err.message = err.message.replace("lstat", "ensureSymlink");
			throw err;
		}
		return {
			toCwd: srcpath,
			toDst: path$5.relative(dstdir, srcpath)
		};
	}
	function symlinkPathsSync(srcpath, dstpath) {
		if (path$5.isAbsolute(srcpath)) {
			if (!fs.existsSync(srcpath)) throw new Error("absolute srcpath does not exist");
			return {
				toCwd: srcpath,
				toDst: srcpath
			};
		}
		const dstdir = path$5.dirname(dstpath);
		const relativeToDst = path$5.join(dstdir, srcpath);
		if (fs.existsSync(relativeToDst)) return {
			toCwd: relativeToDst,
			toDst: srcpath
		};
		if (!fs.existsSync(srcpath)) throw new Error("relative srcpath does not exist");
		return {
			toCwd: srcpath,
			toDst: path$5.relative(dstdir, srcpath)
		};
	}
	module.exports = {
		symlinkPaths: u(symlinkPaths),
		symlinkPathsSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/ensure/symlink-type.js
var require_symlink_type = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs = require_fs();
	const u = require_universalify().fromPromise;
	async function symlinkType(srcpath, type) {
		if (type) return type;
		let stats;
		try {
			stats = await fs.lstat(srcpath);
		} catch {
			return "file";
		}
		return stats && stats.isDirectory() ? "dir" : "file";
	}
	function symlinkTypeSync(srcpath, type) {
		if (type) return type;
		let stats;
		try {
			stats = fs.lstatSync(srcpath);
		} catch {
			return "file";
		}
		return stats && stats.isDirectory() ? "dir" : "file";
	}
	module.exports = {
		symlinkType: u(symlinkType),
		symlinkTypeSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/ensure/symlink.js
var require_symlink = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const u = require_universalify().fromPromise;
	const path$4 = __require("path");
	const fs = require_fs();
	const { mkdirs, mkdirsSync } = require_mkdirs();
	const { symlinkPaths, symlinkPathsSync } = require_symlink_paths();
	const { symlinkType, symlinkTypeSync } = require_symlink_type();
	const { pathExists } = require_path_exists();
	const { areIdentical } = require_stat();
	async function createSymlink(srcpath, dstpath, type) {
		let stats;
		try {
			stats = await fs.lstat(dstpath);
		} catch {}
		if (stats && stats.isSymbolicLink()) {
			const [srcStat, dstStat] = await Promise.all([fs.stat(srcpath), fs.stat(dstpath)]);
			if (areIdentical(srcStat, dstStat)) return;
		}
		const relative = await symlinkPaths(srcpath, dstpath);
		srcpath = relative.toDst;
		const toType = await symlinkType(relative.toCwd, type);
		const dir = path$4.dirname(dstpath);
		if (!await pathExists(dir)) await mkdirs(dir);
		return fs.symlink(srcpath, dstpath, toType);
	}
	function createSymlinkSync(srcpath, dstpath, type) {
		let stats;
		try {
			stats = fs.lstatSync(dstpath);
		} catch {}
		if (stats && stats.isSymbolicLink()) {
			if (areIdentical(fs.statSync(srcpath), fs.statSync(dstpath))) return;
		}
		const relative = symlinkPathsSync(srcpath, dstpath);
		srcpath = relative.toDst;
		type = symlinkTypeSync(relative.toCwd, type);
		const dir = path$4.dirname(dstpath);
		if (fs.existsSync(dir)) return fs.symlinkSync(srcpath, dstpath, type);
		mkdirsSync(dir);
		return fs.symlinkSync(srcpath, dstpath, type);
	}
	module.exports = {
		createSymlink: u(createSymlink),
		createSymlinkSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/ensure/index.js
var require_ensure = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { createFile, createFileSync } = require_file();
	const { createLink, createLinkSync } = require_link();
	const { createSymlink, createSymlinkSync } = require_symlink();
	module.exports = {
		createFile,
		createFileSync,
		ensureFile: createFile,
		ensureFileSync: createFileSync,
		createLink,
		createLinkSync,
		ensureLink: createLink,
		ensureLinkSync: createLinkSync,
		createSymlink,
		createSymlinkSync,
		ensureSymlink: createSymlink,
		ensureSymlinkSync: createSymlinkSync
	};
}));
//#endregion
//#region node_modules/.pnpm/jsonfile@6.2.0/node_modules/jsonfile/utils.js
var require_utils = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function stringify(obj, { EOL = "\n", finalEOL = true, replacer = null, spaces } = {}) {
		const EOF = finalEOL ? EOL : "";
		return JSON.stringify(obj, replacer, spaces).replace(/\n/g, EOL) + EOF;
	}
	function stripBom(content) {
		if (Buffer.isBuffer(content)) content = content.toString("utf8");
		return content.replace(/^\uFEFF/, "");
	}
	module.exports = {
		stringify,
		stripBom
	};
}));
//#endregion
//#region node_modules/.pnpm/jsonfile@6.2.0/node_modules/jsonfile/index.js
var require_jsonfile$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	let _fs;
	try {
		_fs = require_graceful_fs();
	} catch (_) {
		_fs = __require("fs");
	}
	const universalify = require_universalify();
	const { stringify, stripBom } = require_utils();
	async function _readFile(file, options = {}) {
		if (typeof options === "string") options = { encoding: options };
		const fs = options.fs || _fs;
		const shouldThrow = "throws" in options ? options.throws : true;
		let data = await universalify.fromCallback(fs.readFile)(file, options);
		data = stripBom(data);
		let obj;
		try {
			obj = JSON.parse(data, options ? options.reviver : null);
		} catch (err) {
			if (shouldThrow) {
				err.message = `${file}: ${err.message}`;
				throw err;
			} else return null;
		}
		return obj;
	}
	const readFile = universalify.fromPromise(_readFile);
	function readFileSync(file, options = {}) {
		if (typeof options === "string") options = { encoding: options };
		const fs = options.fs || _fs;
		const shouldThrow = "throws" in options ? options.throws : true;
		try {
			let content = fs.readFileSync(file, options);
			content = stripBom(content);
			return JSON.parse(content, options.reviver);
		} catch (err) {
			if (shouldThrow) {
				err.message = `${file}: ${err.message}`;
				throw err;
			} else return null;
		}
	}
	async function _writeFile(file, obj, options = {}) {
		const fs = options.fs || _fs;
		const str = stringify(obj, options);
		await universalify.fromCallback(fs.writeFile)(file, str, options);
	}
	const writeFile = universalify.fromPromise(_writeFile);
	function writeFileSync(file, obj, options = {}) {
		const fs = options.fs || _fs;
		const str = stringify(obj, options);
		return fs.writeFileSync(file, str, options);
	}
	module.exports = {
		readFile,
		readFileSync,
		writeFile,
		writeFileSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/json/jsonfile.js
var require_jsonfile = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const jsonFile = require_jsonfile$1();
	module.exports = {
		readJson: jsonFile.readFile,
		readJsonSync: jsonFile.readFileSync,
		writeJson: jsonFile.writeFile,
		writeJsonSync: jsonFile.writeFileSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/output-file/index.js
var require_output_file = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const u = require_universalify().fromPromise;
	const fs = require_fs();
	const path$3 = __require("path");
	const mkdir = require_mkdirs();
	const pathExists = require_path_exists().pathExists;
	async function outputFile(file, data, encoding = "utf-8") {
		const dir = path$3.dirname(file);
		if (!await pathExists(dir)) await mkdir.mkdirs(dir);
		return fs.writeFile(file, data, encoding);
	}
	function outputFileSync(file, ...args) {
		const dir = path$3.dirname(file);
		if (!fs.existsSync(dir)) mkdir.mkdirsSync(dir);
		fs.writeFileSync(file, ...args);
	}
	module.exports = {
		outputFile: u(outputFile),
		outputFileSync
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/json/output-json.js
var require_output_json = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { stringify } = require_utils();
	const { outputFile } = require_output_file();
	async function outputJson(file, data, options = {}) {
		await outputFile(file, stringify(data, options), options);
	}
	module.exports = outputJson;
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/json/output-json-sync.js
var require_output_json_sync = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { stringify } = require_utils();
	const { outputFileSync } = require_output_file();
	function outputJsonSync(file, data, options) {
		outputFileSync(file, stringify(data, options), options);
	}
	module.exports = outputJsonSync;
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/json/index.js
var require_json = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const u = require_universalify().fromPromise;
	const jsonFile = require_jsonfile();
	jsonFile.outputJson = u(require_output_json());
	jsonFile.outputJsonSync = require_output_json_sync();
	jsonFile.outputJSON = jsonFile.outputJson;
	jsonFile.outputJSONSync = jsonFile.outputJsonSync;
	jsonFile.writeJSON = jsonFile.writeJson;
	jsonFile.writeJSONSync = jsonFile.writeJsonSync;
	jsonFile.readJSON = jsonFile.readJson;
	jsonFile.readJSONSync = jsonFile.readJsonSync;
	module.exports = jsonFile;
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/move/move.js
var require_move$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs = require_fs();
	const path$2 = __require("path");
	const { copy } = require_copy();
	const { remove } = require_remove();
	const { mkdirp } = require_mkdirs();
	const { pathExists } = require_path_exists();
	const stat = require_stat();
	async function move(src, dest, opts = {}) {
		const overwrite = opts.overwrite || opts.clobber || false;
		const { srcStat, isChangingCase = false } = await stat.checkPaths(src, dest, "move", opts);
		await stat.checkParentPaths(src, srcStat, dest, "move");
		const destParent = path$2.dirname(dest);
		if (path$2.parse(destParent).root !== destParent) await mkdirp(destParent);
		return doRename(src, dest, overwrite, isChangingCase);
	}
	async function doRename(src, dest, overwrite, isChangingCase) {
		if (!isChangingCase) {
			if (overwrite) await remove(dest);
			else if (await pathExists(dest)) throw new Error("dest already exists.");
		}
		try {
			await fs.rename(src, dest);
		} catch (err) {
			if (err.code !== "EXDEV") throw err;
			await moveAcrossDevice(src, dest, overwrite);
		}
	}
	async function moveAcrossDevice(src, dest, overwrite) {
		await copy(src, dest, {
			overwrite,
			errorOnExist: true,
			preserveTimestamps: true
		});
		return remove(src);
	}
	module.exports = move;
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/move/move-sync.js
var require_move_sync = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs = require_graceful_fs();
	const path$1 = __require("path");
	const copySync = require_copy().copySync;
	const removeSync = require_remove().removeSync;
	const mkdirpSync = require_mkdirs().mkdirpSync;
	const stat = require_stat();
	function moveSync(src, dest, opts) {
		opts = opts || {};
		const overwrite = opts.overwrite || opts.clobber || false;
		const { srcStat, isChangingCase = false } = stat.checkPathsSync(src, dest, "move", opts);
		stat.checkParentPathsSync(src, srcStat, dest, "move");
		if (!isParentRoot(dest)) mkdirpSync(path$1.dirname(dest));
		return doRename(src, dest, overwrite, isChangingCase);
	}
	function isParentRoot(dest) {
		const parent = path$1.dirname(dest);
		return path$1.parse(parent).root === parent;
	}
	function doRename(src, dest, overwrite, isChangingCase) {
		if (isChangingCase) return rename(src, dest, overwrite);
		if (overwrite) {
			removeSync(dest);
			return rename(src, dest, overwrite);
		}
		if (fs.existsSync(dest)) throw new Error("dest already exists.");
		return rename(src, dest, overwrite);
	}
	function rename(src, dest, overwrite) {
		try {
			fs.renameSync(src, dest);
		} catch (err) {
			if (err.code !== "EXDEV") throw err;
			return moveAcrossDevice(src, dest, overwrite);
		}
	}
	function moveAcrossDevice(src, dest, overwrite) {
		copySync(src, dest, {
			overwrite,
			errorOnExist: true,
			preserveTimestamps: true
		});
		return removeSync(src);
	}
	module.exports = moveSync;
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/move/index.js
var require_move = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const u = require_universalify().fromPromise;
	module.exports = {
		move: u(require_move$1()),
		moveSync: require_move_sync()
	};
}));
//#endregion
//#region node_modules/.pnpm/fs-extra@11.3.0/node_modules/fs-extra/lib/index.js
var require_lib$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		...require_fs(),
		...require_copy(),
		...require_empty(),
		...require_ensure(),
		...require_json(),
		...require_mkdirs(),
		...require_move(),
		...require_output_file(),
		...require_path_exists(),
		...require_remove()
	};
}));
//#endregion
//#region node_modules/.pnpm/rename-overwrite@6.0.6/node_modules/rename-overwrite/index.js
var require_rename_overwrite = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const crypto = __require("crypto");
	const fs = __require("fs");
	const { copySync, copy } = require_lib$1();
	const path = __require("path");
	const rimraf = require_rimraf();
	module.exports = async function renameOverwrite(oldPath, newPath, retry = 0) {
		try {
			await fs.promises.rename(oldPath, newPath);
		} catch (err) {
			retry++;
			if (retry > 3) throw err;
			switch (err.code) {
				case "ENOTEMPTY":
				case "EEXIST":
				case "ENOTDIR":
					try {
						await swapRename(oldPath, newPath);
					} catch {
						await rimraf(newPath);
						await fs.promises.rename(oldPath, newPath);
					}
					break;
				case "EPERM":
				case "EACCESS":
				case "EBUSY": {
					await rimraf(newPath);
					const start = Date.now();
					let backoff = 0;
					let lastError = err;
					while (Date.now() - start < 6e4 && (lastError.code === "EPERM" || lastError.code === "EACCESS" || lastError.code === "EBUSY")) {
						await new Promise((resolve) => setTimeout(resolve, backoff));
						try {
							await fs.promises.rename(oldPath, newPath);
							return;
						} catch (err) {
							lastError = err;
						}
						if (backoff < 100) backoff += 10;
					}
					throw lastError;
				}
				case "ENOENT":
					try {
						await fs.promises.stat(oldPath);
					} catch (statErr) {
						if (statErr.code === "ENOENT") throw statErr;
					}
					await fs.promises.mkdir(path.dirname(newPath), { recursive: true });
					await renameOverwrite(oldPath, newPath, retry);
					break;
				case "EXDEV":
					try {
						await rimraf(newPath);
					} catch (rimrafErr) {
						if (rimrafErr.code !== "ENOENT") throw rimrafErr;
					}
					await copy(oldPath, newPath);
					await rimraf(oldPath);
					break;
				default: throw err;
			}
		}
	};
	module.exports.sync = function renameOverwriteSync(oldPath, newPath, retry = 0) {
		try {
			fs.renameSync(oldPath, newPath);
		} catch (err) {
			retry++;
			if (retry > 3) throw err;
			switch (err.code) {
				case "EPERM":
				case "EACCESS":
				case "EBUSY": {
					rimraf.sync(newPath);
					const start = Date.now();
					let backoff = 0;
					let lastError = err;
					while (Date.now() - start < 6e4 && (lastError.code === "EPERM" || lastError.code === "EACCESS" || lastError.code === "EBUSY")) {
						const waitUntil = Date.now() + backoff;
						while (waitUntil > Date.now());
						try {
							fs.renameSync(oldPath, newPath);
							return;
						} catch (err) {
							lastError = err;
						}
						if (backoff < 100) backoff += 10;
					}
					throw lastError;
				}
				case "ENOTEMPTY":
				case "EEXIST":
				case "ENOTDIR":
					try {
						swapRenameSync(oldPath, newPath);
					} catch {
						rimraf.sync(newPath);
						fs.renameSync(oldPath, newPath);
					}
					break;
				case "ENOENT":
					fs.mkdirSync(path.dirname(newPath), { recursive: true });
					renameOverwriteSync(oldPath, newPath, retry);
					return;
				case "EXDEV":
					try {
						rimraf.sync(newPath);
					} catch (rimrafErr) {
						if (rimrafErr.code !== "ENOENT") throw rimrafErr;
					}
					copySync(oldPath, newPath);
					rimraf.sync(oldPath);
					break;
				default: throw err;
			}
		}
	};
	function tempPath(p) {
		return `${p}_${process.pid.toString(16)}_${crypto.randomBytes(4).toString("hex")}`;
	}
	async function swapRename(oldPath, newPath) {
		const temp = tempPath(newPath);
		await fs.promises.rename(newPath, temp);
		try {
			await fs.promises.rename(oldPath, newPath);
		} catch (err) {
			try {
				await fs.promises.rename(temp, newPath);
			} catch {}
			throw err;
		}
		rimraf(temp).catch(() => {});
	}
	function swapRenameSync(oldPath, newPath) {
		const temp = tempPath(newPath);
		fs.renameSync(newPath, temp);
		try {
			fs.renameSync(oldPath, newPath);
		} catch (err) {
			try {
				fs.renameSync(temp, newPath);
			} catch {}
			throw err;
		}
		try {
			rimraf.sync(temp);
		} catch {}
	}
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+store.cafs@1000.1.4/node_modules/@pnpm/store.cafs/lib/writeFile.js
var require_writeFile = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.writeFile = writeFile;
	const path_1$1 = __importDefault(__require("path"));
	const graceful_fs_1 = __importDefault(require_lib$2());
	const dirs = /* @__PURE__ */ new Set();
	function writeFile(fileDest, buffer, mode) {
		makeDirForFile(fileDest);
		graceful_fs_1.default.writeFileSync(fileDest, buffer, { mode });
	}
	function makeDirForFile(fileDest) {
		const dir = path_1$1.default.dirname(fileDest);
		if (!dirs.has(dir)) {
			graceful_fs_1.default.mkdirSync(dir, { recursive: true });
			dirs.add(dir);
		}
	}
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+store.cafs@1000.1.4/node_modules/@pnpm/store.cafs/lib/writeBufferToCafs.js
var require_writeBufferToCafs = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.writeBufferToCafs = writeBufferToCafs;
	exports.optimisticRenameOverwrite = optimisticRenameOverwrite;
	exports.pathTemp = pathTemp;
	const fs_1 = __importDefault(__require("fs"));
	const path_1 = __importDefault(__require("path"));
	const worker_threads_1 = __importDefault(__require("worker_threads"));
	const util_1 = __importDefault(__require("util"));
	const rename_overwrite_1 = __importDefault(require_rename_overwrite());
	const checkPkgFilesIntegrity_js_1 = require_checkPkgFilesIntegrity();
	const writeFile_js_1 = require_writeFile();
	function writeBufferToCafs(locker, storeDir, buffer, fileDest, mode, integrity) {
		fileDest = path_1.default.join(storeDir, fileDest);
		if (locker.has(fileDest)) return {
			checkedAt: locker.get(fileDest),
			filePath: fileDest
		};
		if (existsSame(fileDest, integrity)) return {
			checkedAt: Date.now(),
			filePath: fileDest
		};
		const temp = pathTemp(fileDest);
		(0, writeFile_js_1.writeFile)(temp, buffer, mode);
		const birthtimeMs = Date.now();
		optimisticRenameOverwrite(temp, fileDest);
		locker.set(fileDest, birthtimeMs);
		return {
			checkedAt: birthtimeMs,
			filePath: fileDest
		};
	}
	function optimisticRenameOverwrite(temp, fileDest) {
		try {
			rename_overwrite_1.default.sync(temp, fileDest);
		} catch (err) {
			if (!(util_1.default.types.isNativeError(err) && "code" in err && err.code === "ENOENT") || !fs_1.default.existsSync(fileDest)) throw err;
		}
	}
	/**
	* Creates a unique temporary file path by appending both process ID and worker thread ID
	* to the original filename.
	*
	* The process ID prevents conflicts between different processes, while the worker thread ID
	* prevents race conditions between threads in the same process.
	*
	* If a process fails, its temporary file may remain. When the process is rerun, it will
	* safely overwrite any existing temporary file with the same name.
	*
	* @param file - The original file path
	* @returns A temporary file path in the format: {basename}{pid}{threadId}
	*/
	function pathTemp(file) {
		const basename = removeSuffix(path_1.default.basename(file));
		return path_1.default.join(path_1.default.dirname(file), `${basename}${process.pid}${worker_threads_1.default.threadId}`);
	}
	function removeSuffix(filePath) {
		const dashPosition = filePath.indexOf("-");
		if (dashPosition === -1) return filePath;
		const withoutSuffix = filePath.substring(0, dashPosition);
		if (filePath.substring(dashPosition) === "-exec") return `${withoutSuffix}x`;
		return withoutSuffix;
	}
	function existsSame(filename, integrity) {
		const existingFile = fs_1.default.statSync(filename, { throwIfNoEntry: false });
		if (!existingFile) return false;
		return (0, checkPkgFilesIntegrity_js_1.verifyFileIntegrity)(filename, {
			size: existingFile.size,
			integrity
		}).passed;
	}
}));
//#endregion
//#region node_modules/.pnpm/@pnpm+store.cafs@1000.1.4/node_modules/@pnpm/store.cafs/lib/index.js
var require_lib = /* @__PURE__ */ __commonJSMin(((exports) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.optimisticRenameOverwrite = exports.getIndexFilePathInCafs = exports.getFilePathByModeInCafs = exports.readManifestFromStore = exports.checkPkgFilesIntegrity = void 0;
	exports.createCafs = createCafs;
	const ssri_1 = __importDefault(require_lib$3());
	const addFilesFromDir_js_1 = require_addFilesFromDir();
	const addFilesFromTarball_js_1 = require_addFilesFromTarball();
	const checkPkgFilesIntegrity_js_1 = require_checkPkgFilesIntegrity();
	Object.defineProperty(exports, "checkPkgFilesIntegrity", {
		enumerable: true,
		get: function() {
			return checkPkgFilesIntegrity_js_1.checkPkgFilesIntegrity;
		}
	});
	const readManifestFromStore_js_1 = require_readManifestFromStore();
	Object.defineProperty(exports, "readManifestFromStore", {
		enumerable: true,
		get: function() {
			return readManifestFromStore_js_1.readManifestFromStore;
		}
	});
	const getFilePathInCafs_js_1 = require_getFilePathInCafs();
	Object.defineProperty(exports, "getIndexFilePathInCafs", {
		enumerable: true,
		get: function() {
			return getFilePathInCafs_js_1.getIndexFilePathInCafs;
		}
	});
	Object.defineProperty(exports, "getFilePathByModeInCafs", {
		enumerable: true,
		get: function() {
			return getFilePathInCafs_js_1.getFilePathByModeInCafs;
		}
	});
	const writeBufferToCafs_js_1 = require_writeBufferToCafs();
	Object.defineProperty(exports, "optimisticRenameOverwrite", {
		enumerable: true,
		get: function() {
			return writeBufferToCafs_js_1.optimisticRenameOverwrite;
		}
	});
	function createCafs(storeDir, { ignoreFile, cafsLocker } = {}) {
		const _writeBufferToCafs = writeBufferToCafs_js_1.writeBufferToCafs.bind(null, cafsLocker ?? /* @__PURE__ */ new Map(), storeDir);
		const addBuffer = addBufferToCafs.bind(null, _writeBufferToCafs);
		return {
			addFilesFromDir: addFilesFromDir_js_1.addFilesFromDir.bind(null, addBuffer),
			addFilesFromTarball: addFilesFromTarball_js_1.addFilesFromTarball.bind(null, addBuffer, ignoreFile ?? null),
			addFile: addBuffer,
			getIndexFilePathInCafs: getFilePathInCafs_js_1.getIndexFilePathInCafs.bind(null, storeDir),
			getFilePathByModeInCafs: getFilePathInCafs_js_1.getFilePathByModeInCafs.bind(null, storeDir)
		};
	}
	function addBufferToCafs(writeBufferToCafs, buffer, mode) {
		const integrity = ssri_1.default.fromData(buffer);
		const isExecutable = (0, getFilePathInCafs_js_1.modeIsExecutable)(mode);
		const { checkedAt, filePath } = writeBufferToCafs(buffer, (0, getFilePathInCafs_js_1.contentPathFromHex)(isExecutable ? "exec" : "nonexec", integrity.hexDigest()), isExecutable ? 493 : void 0, integrity);
		return {
			checkedAt,
			integrity,
			filePath
		};
	}
}));
//#endregion
//#region nix/scripts/pnpm-cafs-add.ts
/**
* pnpm-cafs-add — Write a single npm tarball into a pnpm CAFS store fragment
* using pnpm's own @pnpm/store.cafs library.
*
* Usage:
*   node pnpm-cafs-add.mjs <tarball.tgz> <output-dir> <name@version> <sha512-base64>
*
* The output-dir will contain the complete store structure:
*   output-dir/.fetcher-version                    ← "2" (raw directory format)
*   output-dir/<STORE_VERSION>/files/...           ← content-addressed files
*   output-dir/<STORE_VERSION>/index/...           ← package index JSON
*
* ALL pnpm format knowledge is encapsulated here via @pnpm/store.cafs and
* @pnpm/constants. The Nix merge derivation is completely format-agnostic.
*/
var import_lib = require_lib$4();
var import_lib$1 = require_lib();
const [, , tarballPath, outputDir, nameVersion, integrityArg] = process$1.argv;
if (!tarballPath || !outputDir || !nameVersion || !integrityArg) {
	console.error("Usage: pnpm-cafs-add <tarball.tgz> <output-dir> <name@version> <sha512-base64>");
	process$1.exit(1);
}
const lastAt = nameVersion.lastIndexOf("@");
const pkgName = nameVersion.slice(0, lastAt);
const pkgVersion = nameVersion.slice(lastAt + 1);
const cafsDir = join(outputDir, import_lib.STORE_VERSION);
const tarballBuffer = readFileSync(tarballPath);
const cafs = (0, import_lib$1.createCafs)(cafsDir);
const { filesIndex } = cafs.addFilesFromTarball(tarballBuffer);
const files = {};
for (const [relPath, info] of Object.entries(filesIndex)) files[relPath] = {
	integrity: info.integrity.toString(),
	mode: info.mode,
	size: info.size
};
const indexPath = cafs.getIndexFilePathInCafs(integrityArg, nameVersion);
mkdirSync(dirname(indexPath), { recursive: true });
writeFileSync(indexPath, JSON.stringify({
	name: pkgName,
	version: pkgVersion,
	requiresBuild: false,
	files
}));
writeFileSync(join(outputDir, ".fetcher-version"), "2");
//#endregion
export {};
