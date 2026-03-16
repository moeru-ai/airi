//#region src/encoding/wav.d.ts
declare function toWav(buffer: ArrayBufferLike, sampleRate: number, channel?: number): ArrayBuffer;
declare function toWAVBase64(buffer: ArrayBufferLike, sampleRate: number): string;
//#endregion
export { toWAVBase64, toWav };