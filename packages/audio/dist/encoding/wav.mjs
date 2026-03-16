import { encodeBase64 } from "@moeru/std/base64";

//#region src/encoding/wav.ts
function writeString(dataView, offset, string) {
	for (let i = 0; i < string.length; i++) dataView.setUint8(offset + i, string.charCodeAt(i));
}
function toWav(buffer, sampleRate, channel = 1) {
	const samples = new Float32Array(buffer);
	const numChannels = channel;
	const numSamples = samples.length;
	const arrayBuffer = /* @__PURE__ */ new ArrayBuffer(44 + numSamples * 2);
	const dataView = new DataView(arrayBuffer);
	writeString(dataView, 0, "RIFF");
	dataView.setUint32(4, 36 + numSamples * 2, true);
	writeString(dataView, 8, "WAVE");
	writeString(dataView, 12, "fmt ");
	dataView.setUint32(16, 16, true);
	dataView.setUint16(20, 1, true);
	dataView.setUint16(22, numChannels, true);
	dataView.setUint32(24, sampleRate, true);
	dataView.setUint32(28, sampleRate * numChannels * 2, true);
	dataView.setUint16(32, numChannels * 2, true);
	dataView.setUint16(34, 16, true);
	writeString(dataView, 36, "data");
	dataView.setUint32(40, numSamples * 2, true);
	const offset = 44;
	for (let i = 0; i < numSamples; i++) {
		const sample = Math.max(-1, Math.min(1, samples[i]));
		const value = sample < 0 ? sample * 32768 : sample * 32767;
		dataView.setInt16(offset + i * 2, value, true);
	}
	return arrayBuffer;
}
function toWAVBase64(buffer, sampleRate) {
	return encodeBase64(toWav(buffer, sampleRate));
}

//#endregion
export { toWAVBase64, toWav };