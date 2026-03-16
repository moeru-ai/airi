import LibsamplerateWorkletURL from "@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js?worker&url";
import ProcessorWorkletURL from "./processor.worklet?worker&url";

//#region src/audio-context/index.ts
let context;
let sampleRate = 48e3;
let isReady = false;
let error = "";
let isInitializing = false;
let workletLoaded = false;
const activeSources = /* @__PURE__ */ new Set();
const activeGainNodes = /* @__PURE__ */ new Set();
const activeAnalyzers = /* @__PURE__ */ new Set();
const activeWorkletNodes = /* @__PURE__ */ new Set();
const listeners = /* @__PURE__ */ new Set();
function notifyListeners() {
	const state = {
		isReady,
		sampleRate,
		error,
		isInitializing,
		workletLoaded,
		currentTime: context?.currentTime ?? 0,
		state: context?.state ?? "closed"
	};
	listeners.forEach((listener) => {
		try {
			listener(state);
		} catch (err) {
			console.error("AudioContext state listener error:", err);
		}
	});
}
async function loadWorklets() {
	if (!context || workletLoaded) return;
	try {
		await context.audioWorklet.addModule(ProcessorWorkletURL);
		await context.audioWorklet.addModule(LibsamplerateWorkletURL);
		workletLoaded = true;
	} catch (err) {
		console.error("Failed to load AudioWorklets:", err);
		throw new Error(`Worklet loading failed: ${err}`);
	}
}
async function initializeAudioContext(requestedSampleRate = 48e3) {
	const baseSampleRate = Math.max(requestedSampleRate, 48e3);
	if (context && isReady && sampleRate === baseSampleRate && workletLoaded) return context;
	if (isInitializing) return new Promise((resolve, reject) => {
		const checkReady = () => {
			if (!isInitializing) if (context && isReady && workletLoaded) resolve(context);
			else reject(new Error(error || "AudioContext initialization failed"));
			else setTimeout(checkReady, 10);
		};
		checkReady();
	});
	isInitializing = true;
	error = "";
	notifyListeners();
	try {
		if (context && sampleRate !== baseSampleRate) await cleanupAudioContext();
		if (!context) {
			context = new AudioContext({ sampleRate: baseSampleRate });
			sampleRate = baseSampleRate;
		}
		if (context.state === "suspended") await context.resume();
		await loadWorklets();
		isReady = true;
		notifyListeners();
		return context;
	} catch (err) {
		error = err instanceof Error ? err.message : String(err);
		isReady = false;
		workletLoaded = false;
		notifyListeners();
		console.error("Failed to initialize AudioContext:", err);
		throw err;
	} finally {
		isInitializing = false;
		notifyListeners();
	}
}
function createAudioSource(mediaStream) {
	if (!context || !isReady) throw new Error("AudioContext not initialized");
	const source = context.createMediaStreamSource(mediaStream);
	activeSources.add(source);
	return source;
}
function createAudioAnalyser(options) {
	if (!context || !isReady) throw new Error("AudioContext not initialized");
	const analyser = context.createAnalyser();
	if (options?.fftSize) analyser.fftSize = options.fftSize;
	if (options?.smoothingTimeConstant !== void 0) analyser.smoothingTimeConstant = options.smoothingTimeConstant;
	if (options?.minDecibels !== void 0) analyser.minDecibels = options.minDecibels;
	if (options?.maxDecibels !== void 0) analyser.maxDecibels = options.maxDecibels;
	activeAnalyzers.add(analyser);
	return analyser;
}
function createAudioGainNode(initialGain = 1) {
	if (!context || !isReady) throw new Error("AudioContext not initialized");
	const gainNode = context.createGain();
	gainNode.gain.value = initialGain;
	activeGainNodes.add(gainNode);
	return gainNode;
}
function removeAudioSource(source) {
	source.disconnect();
	activeSources.delete(source);
}
function removeAudioGainNode(gainNode) {
	gainNode.disconnect();
	activeGainNodes.delete(gainNode);
}
function removeAudioAnalyser(analyser) {
	analyser.disconnect();
	activeAnalyzers.delete(analyser);
}
async function suspendAudioContext() {
	if (context && context.state === "running") {
		await context.suspend();
		notifyListeners();
	}
}
async function resumeAudioContext() {
	if (context && context.state === "suspended") {
		await context.resume();
		notifyListeners();
	}
}
function createResamplingWorkletNode(inputNode, options = {}) {
	if (!context || !isReady || !workletLoaded) throw new Error("AudioContext or worklets not ready");
	const workletOptions = {
		inputSampleRate: sampleRate,
		outputSampleRate: 16e3,
		channels: 1,
		converterType: 2,
		bufferSize: 4096,
		...options
	};
	const workletNode = new AudioWorkletNode(context, "resampling-processor", {
		numberOfInputs: 1,
		numberOfOutputs: 1,
		channelCount: workletOptions.channels,
		processorOptions: workletOptions
	});
	inputNode.connect(workletNode);
	activeWorkletNodes.add(workletNode);
	return workletNode;
}
function removeWorkletNode(node) {
	node.disconnect();
	activeWorkletNodes.delete(node);
}
async function cleanupAudioContext() {
	activeSources.forEach((source) => source.disconnect());
	activeGainNodes.forEach((gainNode) => gainNode.disconnect());
	activeAnalyzers.forEach((analyser) => analyser.disconnect());
	activeWorkletNodes.forEach((worklet) => worklet.disconnect());
	activeSources.clear();
	activeGainNodes.clear();
	activeAnalyzers.clear();
	activeWorkletNodes.clear();
	if (context && context.state !== "closed") await context.close();
	context = void 0;
	isReady = false;
	workletLoaded = false;
	error = "";
	notifyListeners();
}
function getAudioContextState() {
	return {
		isReady,
		sampleRate,
		error,
		isInitializing,
		workletLoaded,
		currentTime: context?.currentTime ?? 0,
		state: context?.state ?? "closed"
	};
}
function getAudioContext() {
	return context;
}
function getCurrentTime() {
	return context?.currentTime ?? 0;
}
function isAudioContextReady() {
	return isReady;
}
function subscribeToAudioContext(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
if ("window" in globalThis && globalThis.window != null) {
	globalThis.window.addEventListener("beforeunload", cleanupAudioContext);
	globalThis.window.addEventListener("pagehide", cleanupAudioContext);
}

//#endregion
export { cleanupAudioContext, createAudioAnalyser, createAudioGainNode, createAudioSource, createResamplingWorkletNode, getAudioContext, getAudioContextState, getCurrentTime, initializeAudioContext, isAudioContextReady, removeAudioAnalyser, removeAudioGainNode, removeAudioSource, removeWorkletNode, resumeAudioContext, subscribeToAudioContext, suspendAudioContext };