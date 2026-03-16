import { createContext, defineEventa } from "@moeru/eventa";
import { readGraphemeClusters } from "clustr";

//#region src/eventa.ts
const speechSegmentEvent = defineEventa("proj-airi:pipelines:output:speech:segment");
const speechSpecialEvent = defineEventa("proj-airi:pipelines:output:speech:special");
const speechTtsRequestEvent = defineEventa("proj-airi:pipelines:output:speech:tts-request");
const speechTtsResultEvent = defineEventa("proj-airi:pipelines:output:speech:tts-result");
const speechPlaybackStartEvent = defineEventa("proj-airi:pipelines:output:speech:playback-start");
const speechPlaybackEndEvent = defineEventa("proj-airi:pipelines:output:speech:playback-end");
const speechPlaybackInterruptEvent = defineEventa("proj-airi:pipelines:output:speech:playback-interrupt");
const speechPlaybackRejectEvent = defineEventa("proj-airi:pipelines:output:speech:playback-reject");
const speechIntentStartEvent = defineEventa("proj-airi:pipelines:output:speech:intent-start");
const speechIntentEndEvent = defineEventa("proj-airi:pipelines:output:speech:intent-end");
const speechIntentCancelEvent = defineEventa("proj-airi:pipelines:output:speech:intent-cancel");
const speechPipelineEventMap = {
	onSegment: speechSegmentEvent,
	onSpecial: speechSpecialEvent,
	onTtsRequest: speechTtsRequestEvent,
	onTtsResult: speechTtsResultEvent,
	onPlaybackStart: speechPlaybackStartEvent,
	onPlaybackEnd: speechPlaybackEndEvent,
	onPlaybackInterrupt: speechPlaybackInterruptEvent,
	onPlaybackReject: speechPlaybackRejectEvent,
	onIntentStart: speechIntentStartEvent,
	onIntentEnd: speechIntentEndEvent,
	onIntentCancel: speechIntentCancelEvent
};

//#endregion
//#region src/managers/playback-manager.ts
function createPlaybackManager(options) {
	const maxVoices = Math.max(1, options.maxVoices ?? 1);
	const maxVoicesPerOwner = options.maxVoicesPerOwner;
	const overflowPolicy = options.overflowPolicy ?? "queue";
	const ownerOverflowPolicy = options.ownerOverflowPolicy ?? "steal-oldest";
	const active = /* @__PURE__ */ new Map();
	const waiting = [];
	const listeners = {
		start: [],
		end: [],
		interrupt: [],
		reject: []
	};
	function onStart(listener) {
		listeners.start.push(listener);
	}
	function onEnd(listener) {
		listeners.end.push(listener);
	}
	function onInterrupt(listener) {
		listeners.interrupt.push(listener);
	}
	function onReject(listener) {
		listeners.reject.push(listener);
	}
	function emitStart(item) {
		const event = {
			item,
			startedAt: Date.now()
		};
		listeners.start.forEach((listener) => listener(event));
	}
	function emitEnd(item) {
		const event = {
			item,
			endedAt: Date.now()
		};
		listeners.end.forEach((listener) => listener(event));
	}
	function emitInterrupt(item, reason) {
		const event = {
			item,
			reason,
			interruptedAt: Date.now()
		};
		listeners.interrupt.forEach((listener) => listener(event));
	}
	function emitReject(item, reason) {
		const event = {
			item,
			reason
		};
		listeners.reject.forEach((listener) => listener(event));
	}
	function countByOwner(ownerId) {
		if (!ownerId) return 0;
		let count = 0;
		for (const entry of active.values()) if (entry.item.ownerId === ownerId) count += 1;
		return count;
	}
	function chooseVictimByPriority() {
		let victim;
		for (const entry of active.values()) if (!victim) victim = entry;
		else if (entry.item.priority < victim.item.priority) victim = entry;
		return victim;
	}
	function chooseVictimOldest(ownerId) {
		let victim;
		for (const entry of active.values()) {
			if (ownerId && entry.item.ownerId !== ownerId) continue;
			if (!victim || entry.startedAt < victim.startedAt) victim = entry;
		}
		return victim;
	}
	function stopActive(entry, reason) {
		entry.controller.abort(reason);
		active.delete(entry.item.id);
		emitInterrupt(entry.item, reason);
	}
	function canStart(item) {
		if (active.size >= maxVoices) return {
			ok: false,
			reason: "overflow"
		};
		if (maxVoicesPerOwner && item.ownerId) {
			if (countByOwner(item.ownerId) >= maxVoicesPerOwner) return {
				ok: false,
				reason: "owner-overflow"
			};
		}
		return { ok: true };
	}
	function start(item) {
		const controller = new AbortController();
		const startedAt = Date.now();
		active.set(item.id, {
			item,
			controller,
			startedAt
		});
		emitStart(item);
		options.play(item, controller.signal).then(() => {
			if (!active.has(item.id)) return;
			active.delete(item.id);
			emitEnd(item);
			tryStartWaiting();
		}).catch((err) => {
			if (!active.has(item.id)) return;
			active.delete(item.id);
			emitInterrupt(item, err instanceof Error ? err.message : "playback-error");
			tryStartWaiting();
		});
	}
	function tryStartWaiting() {
		if (waiting.length === 0) return;
		const candidates = waiting.slice().sort((a, b) => b.item.priority - a.item.priority || a.enqueuedAt - b.enqueuedAt);
		for (const candidate of candidates) {
			const { ok, reason } = canStart(candidate.item);
			if (!ok) {
				if (reason === "owner-overflow" && ownerOverflowPolicy === "steal-oldest") {
					const victim = chooseVictimOldest(candidate.item.ownerId);
					if (victim) stopActive(victim, "owner-overflow");
				}
				continue;
			}
			const index = waiting.indexOf(candidate);
			if (index >= 0) waiting.splice(index, 1);
			start(candidate.item);
			if (active.size >= maxVoices) break;
		}
	}
	function handleOverflow(item, reason) {
		if (reason === "owner-overflow") {
			if (ownerOverflowPolicy === "reject") {
				emitReject(item, "owner-overflow");
				return;
			}
			const victim = chooseVictimOldest(item.ownerId);
			if (victim) {
				stopActive(victim, "owner-overflow");
				waiting.push({
					item,
					enqueuedAt: Date.now()
				});
				tryStartWaiting();
				return;
			}
		}
		switch (overflowPolicy) {
			case "reject":
				emitReject(item, "overflow");
				break;
			case "queue":
				waiting.push({
					item,
					enqueuedAt: Date.now()
				});
				break;
			case "steal-oldest": {
				const victim = chooseVictimOldest();
				if (victim) stopActive(victim, "steal-oldest");
				waiting.push({
					item,
					enqueuedAt: Date.now()
				});
				tryStartWaiting();
				break;
			}
			case "steal-lowest-priority": {
				const victim = chooseVictimByPriority();
				if (victim && victim.item.priority <= item.priority) {
					stopActive(victim, "steal-lowest-priority");
					waiting.push({
						item,
						enqueuedAt: Date.now()
					});
					tryStartWaiting();
				} else emitReject(item, "lower-priority");
				break;
			}
		}
	}
	function schedule(item) {
		const { ok, reason } = canStart(item);
		if (ok) {
			start(item);
			return;
		}
		handleOverflow(item, reason);
	}
	function stopAll(reason) {
		for (const entry of active.values()) stopActive(entry, reason);
		waiting.length = 0;
	}
	function stopByIntent(intentId, reason) {
		for (const entry of active.values()) {
			if (entry.item.intentId !== intentId) continue;
			stopActive(entry, reason);
		}
		for (let i = waiting.length - 1; i >= 0; i -= 1) if (waiting[i]?.item.intentId === intentId) waiting.splice(i, 1);
	}
	function stopByOwner(ownerId, reason) {
		for (const entry of active.values()) {
			if (entry.item.ownerId !== ownerId) continue;
			stopActive(entry, reason);
		}
		for (let i = waiting.length - 1; i >= 0; i -= 1) if (waiting[i]?.item.ownerId === ownerId) waiting.splice(i, 1);
	}
	return {
		schedule,
		stopAll,
		stopByIntent,
		stopByOwner,
		onStart,
		onEnd,
		onInterrupt,
		onReject
	};
}

//#endregion
//#region src/priority.ts
const DEFAULT_LEVELS = {
	critical: 300,
	high: 200,
	normal: 100,
	low: 0
};
function createPriorityResolver(levels) {
	const resolved = {
		...DEFAULT_LEVELS,
		...levels
	};
	return { resolve(priority) {
		if (priority == null) return resolved.normal;
		if (typeof priority === "number") return priority;
		return resolved[priority] ?? resolved.normal;
	} };
}
function comparePriority(a, b) {
	if (a === b) return 0;
	return a > b ? 1 : -1;
}

//#endregion
//#region src/stream.ts
function createPushStream() {
	let closed = false;
	let controller = null;
	return {
		stream: new ReadableStream({
			start(ctrl) {
				controller = ctrl;
			},
			cancel() {
				closed = true;
			}
		}),
		write(value) {
			if (!controller || closed) return;
			controller.enqueue(value);
		},
		close() {
			if (!controller || closed) return;
			closed = true;
			controller.close();
		},
		error(err) {
			if (!controller || closed) return;
			closed = true;
			controller.error(err);
		},
		isClosed() {
			return closed;
		}
	};
}
async function readStream(stream, handler) {
	const reader = stream.getReader();
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			await handler(value);
		}
	} finally {
		reader.releaseLock();
	}
}

//#endregion
//#region src/processors/tts-chunker.ts
const TTS_FLUSH_INSTRUCTION = "​";
const TTS_SPECIAL_TOKEN = "⁣";
const keptPunctuations = /* @__PURE__ */ new Set("?？!！");
const hardPunctuations = /* @__PURE__ */ new Set(".。?？!！…⋯～~\n	\r");
const softPunctuations = /* @__PURE__ */ new Set(",，、–—:：;；《》「」");
async function* chunkTtsInput(input, options) {
	const { boost = 2, minimumWords = 4, maximumWords = 12 } = options ?? {};
	const iterator = readGraphemeClusters(typeof input === "string" ? new ReadableStream({ start(controller) {
		controller.enqueue(new TextEncoder().encode(input));
		controller.close();
	} }).getReader() : input);
	const segmenter = new Intl.Segmenter(void 0, { granularity: "word" });
	let yieldCount = 0;
	let buffer = "";
	let chunk = "";
	let chunkWordsCount = 0;
	let previousValue;
	let current = await iterator.next();
	while (!current.done) {
		let value = current.value;
		if (value.length > 1) {
			previousValue = value;
			current = await iterator.next();
			continue;
		}
		const flush = value === TTS_FLUSH_INSTRUCTION;
		const special = value === TTS_SPECIAL_TOKEN;
		const hard = hardPunctuations.has(value);
		const soft = softPunctuations.has(value);
		const kept = keptPunctuations.has(value);
		let next;
		let afterNext;
		if (flush || special || hard || soft) {
			switch (value) {
				case ".":
				case ",": if (previousValue !== void 0 && /\d/.test(previousValue)) {
					next = await iterator.next();
					if (!next.done && next.value && /\d/.test(next.value)) {
						buffer += value;
						current = next;
						next = void 0;
						continue;
					}
				} else if (value === ".") {
					next = await iterator.next();
					if (!next.done && next.value && next.value === ".") {
						afterNext = await iterator.next();
						if (!afterNext.done && afterNext.value && afterNext.value === ".") {
							value = "…";
							next = void 0;
							afterNext = void 0;
						}
					}
				}
			}
			if (buffer.length === 0) {
				if (special) {
					yield {
						text: "",
						words: 0,
						reason: "special"
					};
					yieldCount++;
					chunkWordsCount = 0;
				}
				previousValue = value;
				current = await iterator.next();
				continue;
			}
			const words = [...segmenter.segment(buffer)].filter((w) => w.isWordLike);
			if (chunkWordsCount > minimumWords && chunkWordsCount + words.length > maximumWords) {
				yield {
					text: kept ? chunk.trim() + value : chunk.trim(),
					words: chunkWordsCount,
					reason: "limit"
				};
				yieldCount++;
				chunk = "";
				chunkWordsCount = 0;
			}
			chunk += buffer + value;
			chunkWordsCount += words.length;
			buffer = "";
			if (special) {
				yield {
					text: chunk.slice(0, -1).trim(),
					words: chunkWordsCount,
					reason: "special"
				};
				yieldCount++;
				chunk = "";
				chunkWordsCount = 0;
			} else if (flush || hard || chunkWordsCount > maximumWords || yieldCount < boost) {
				yield {
					text: chunk.trim(),
					words: chunkWordsCount,
					reason: flush ? "flush" : hard ? "hard" : chunkWordsCount > maximumWords ? "limit" : "boost"
				};
				yieldCount++;
				chunk = "";
				chunkWordsCount = 0;
			}
			previousValue = value;
			if (next !== void 0) if (afterNext !== void 0) {
				current = afterNext;
				next = void 0;
				afterNext = void 0;
			} else {
				current = next;
				next = void 0;
			}
			else current = await iterator.next();
			continue;
		}
		buffer += value;
		previousValue = value;
		next = await iterator.next();
		current = next;
	}
	console.debug("while loop ends, chunk/buffer:", chunk, buffer);
	if (chunk.length > 0 || buffer.length > 0) yield {
		text: (chunk + buffer).trim(),
		words: chunkWordsCount + [...segmenter.segment(buffer)].filter((w) => w.isWordLike).length,
		reason: "flush"
	};
}
async function chunkEmitter(reader, pendingSpecials, options, handler) {
	const sanitizeChunk = (text) => text.replaceAll(TTS_SPECIAL_TOKEN, "").replaceAll(TTS_FLUSH_INSTRUCTION, "").trim();
	try {
		for await (const chunk of chunkTtsInput(reader, options)) if (chunk.reason === "special") {
			const specialToken = pendingSpecials.shift();
			await handler({
				chunk: sanitizeChunk(chunk.text),
				special: specialToken ?? null,
				reason: chunk.reason
			});
		} else await handler({
			chunk: sanitizeChunk(chunk.text),
			special: null,
			reason: chunk.reason
		});
	} catch (e) {
		console.error("Error chunking stream to TTS queue:", e);
	}
}
function createTtsSegmentStream(tokens, meta, options) {
	const { stream, write, close, error } = createPushStream();
	const pendingSpecials = [];
	const encoder = new TextEncoder();
	const { stream: byteStream, write: writeBytes, close: closeBytes, error: errorBytes } = createPushStream();
	(async () => {
		const reader = tokens.getReader();
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;
				if (value.type === "literal") {
					if (value.value) writeBytes(encoder.encode(value.value));
				} else if (value.type === "special") {
					pendingSpecials.push(value.value ?? "");
					writeBytes(encoder.encode(TTS_SPECIAL_TOKEN));
				} else if (value.type === "flush") writeBytes(encoder.encode(TTS_FLUSH_INSTRUCTION));
			}
			closeBytes();
		} catch (err) {
			errorBytes(err);
		} finally {
			reader.releaseLock();
		}
	})();
	(async () => {
		try {
			await chunkEmitter(byteStream.getReader(), pendingSpecials, options, async (chunk) => {
				write({
					streamId: meta.streamId,
					intentId: meta.intentId,
					segmentId: `${meta.streamId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
					text: chunk.chunk,
					special: chunk.special,
					reason: chunk.reason,
					createdAt: Date.now()
				});
			});
			close();
		} catch (err) {
			error(err);
		}
	})();
	return stream;
}

//#endregion
//#region src/speech-pipeline.ts
function createId(prefix) {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function createSpeechPipeline(options) {
	const logger = options.logger ?? console;
	const priorityResolver = options.priority ?? createPriorityResolver();
	const segmenter = options.segmenter ?? createTtsSegmentStream;
	const context = createContext();
	const intents = /* @__PURE__ */ new Map();
	const pending = [];
	let activeIntent = null;
	options.playback.onStart((event) => context.emit(speechPipelineEventMap.onPlaybackStart, event));
	options.playback.onEnd((event) => context.emit(speechPipelineEventMap.onPlaybackEnd, event));
	options.playback.onInterrupt((event) => context.emit(speechPipelineEventMap.onPlaybackInterrupt, event));
	options.playback.onReject((event) => context.emit(speechPipelineEventMap.onPlaybackReject, event));
	function enqueueIntent(intent) {
		pending.push(intent);
	}
	function pickNextIntent() {
		if (pending.length === 0) return null;
		pending.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
		return pending.shift() ?? null;
	}
	async function runIntent(intent) {
		activeIntent = intent;
		context.emit(speechPipelineEventMap.onIntentStart, intent.intentId);
		const tokenStream = intent.stream;
		const segmentStream = segmenter(tokenStream, {
			streamId: intent.streamId,
			intentId: intent.intentId
		});
		try {
			const reader = segmentStream.getReader();
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;
				if (intent.canceled || intent.controller.signal.aborted) {
					await reader.cancel();
					break;
				}
				context.emit(speechPipelineEventMap.onSegment, value);
				if (value.text === "" && value.special) {
					context.emit(speechPipelineEventMap.onSpecial, value);
					continue;
				}
				const request = {
					streamId: value.streamId,
					intentId: value.intentId,
					segmentId: value.segmentId,
					text: value.text,
					special: value.special,
					priority: intent.priority,
					createdAt: Date.now()
				};
				context.emit(speechPipelineEventMap.onTtsRequest, request);
				let audio = null;
				try {
					audio = await options.tts(request, intent.controller.signal);
				} catch (err) {
					logger.warn("TTS generation failed:", err);
					if (intent.controller.signal.aborted) break;
					continue;
				}
				if (intent.controller.signal.aborted) break;
				if (!audio) continue;
				const ttsResult = {
					streamId: request.streamId,
					intentId: request.intentId,
					segmentId: request.segmentId,
					text: request.text,
					special: request.special,
					audio,
					createdAt: Date.now()
				};
				context.emit(speechPipelineEventMap.onTtsResult, ttsResult);
				options.playback.schedule({
					id: createId("playback"),
					streamId: ttsResult.streamId,
					intentId: ttsResult.intentId,
					segmentId: ttsResult.segmentId,
					ownerId: intent.ownerId,
					priority: intent.priority,
					text: ttsResult.text,
					special: ttsResult.special,
					audio: ttsResult.audio,
					createdAt: Date.now()
				});
			}
			reader.releaseLock();
		} catch (err) {
			logger.warn("Speech pipeline intent failed:", err);
		} finally {
			if (intent.canceled) context.emit(speechPipelineEventMap.onIntentCancel, {
				intentId: intent.intentId,
				reason: intent.controller.signal.reason
			});
			else context.emit(speechPipelineEventMap.onIntentEnd, intent.intentId);
			intents.delete(intent.intentId);
			activeIntent = null;
			const next = pickNextIntent();
			if (next) runIntent(next);
		}
	}
	function openIntent(optionsInput) {
		const intentId = optionsInput?.intentId ?? createId("intent");
		const streamId = optionsInput?.streamId ?? createId("stream");
		const priority = priorityResolver.resolve(optionsInput?.priority);
		const behavior = optionsInput?.behavior ?? "queue";
		const ownerId = optionsInput?.ownerId;
		const controller = new AbortController();
		const { stream, write, close } = createPushStream();
		let sequence = 0;
		const intent = {
			intentId,
			streamId,
			priority,
			ownerId,
			behavior,
			createdAt: Date.now(),
			controller,
			stream,
			closeStream: close,
			canceled: false
		};
		intents.set(intentId, intent);
		const handle = {
			intentId,
			streamId,
			priority,
			ownerId,
			stream,
			writeLiteral(text) {
				if (intent.canceled) return;
				write({
					type: "literal",
					value: text,
					streamId,
					intentId,
					sequence: sequence++,
					createdAt: Date.now()
				});
			},
			writeSpecial(special) {
				if (intent.canceled) return;
				write({
					type: "special",
					value: special,
					streamId,
					intentId,
					sequence: sequence++,
					createdAt: Date.now()
				});
			},
			writeFlush() {
				if (intent.canceled) return;
				write({
					type: "flush",
					streamId,
					intentId,
					sequence: sequence++,
					createdAt: Date.now()
				});
			},
			end() {
				close();
			},
			cancel(reason) {
				cancelIntent(intentId, reason);
			}
		};
		if (!activeIntent) {
			runIntent(intent);
			return handle;
		}
		if (behavior === "replace") {
			cancelIntent(activeIntent.intentId, "replace");
			runIntent(intent);
			return handle;
		}
		if (behavior === "interrupt" && intent.priority >= activeIntent.priority) {
			cancelIntent(activeIntent.intentId, "interrupt");
			runIntent(intent);
			return handle;
		}
		enqueueIntent(intent);
		return handle;
	}
	function cancelIntent(intentId, reason) {
		const intent = intents.get(intentId);
		if (!intent) return;
		intent.canceled = true;
		intent.controller.abort(reason ?? "canceled");
		intent.closeStream();
		if (activeIntent?.intentId === intentId) {
			options.playback.stopByIntent(intentId, reason ?? "canceled");
			return;
		}
		const index = pending.findIndex((item) => item.intentId === intentId);
		if (index >= 0) pending.splice(index, 1);
	}
	function interrupt(reason) {
		if (activeIntent) cancelIntent(activeIntent.intentId, reason);
	}
	function stopAll(reason) {
		for (const intent of intents.values()) {
			intent.canceled = true;
			intent.controller.abort(reason);
			intent.closeStream();
		}
		pending.length = 0;
		intents.clear();
		activeIntent = null;
		options.playback.stopAll(reason);
	}
	return {
		openIntent,
		cancelIntent,
		interrupt,
		stopAll,
		on(event, listener) {
			return context.on(speechPipelineEventMap[event], (payload) => {
				listener(payload?.body ?? payload);
			});
		}
	};
}

//#endregion
export { TTS_FLUSH_INSTRUCTION, TTS_SPECIAL_TOKEN, chunkEmitter, chunkTtsInput, comparePriority, createPlaybackManager, createPriorityResolver, createPushStream, createSpeechPipeline, createTtsSegmentStream, readStream, speechIntentCancelEvent, speechIntentEndEvent, speechIntentStartEvent, speechPipelineEventMap, speechPlaybackEndEvent, speechPlaybackInterruptEvent, speechPlaybackRejectEvent, speechPlaybackStartEvent, speechSegmentEvent, speechSpecialEvent, speechTtsRequestEvent, speechTtsResultEvent };