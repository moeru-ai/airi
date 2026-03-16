import { DesktopCapturerSource, SourcesOptions } from "electron";

//#region src/index.d.ts
interface SerializableDesktopCapturerSource extends Pick<DesktopCapturerSource, 'id' | 'name' | 'display_id'> {
  appIcon?: Uint8Array;
  thumbnail?: Uint8Array;
}
interface ScreenCaptureSetSourceRequest {
  options: SourcesOptions;
  sourceId: string;
  /**
   * Timeout in milliseconds to release the setSourceMutex.
   *
   * @default 5000
   */
  timeout?: number;
}
//#endregion
export { ScreenCaptureSetSourceRequest, SerializableDesktopCapturerSource };