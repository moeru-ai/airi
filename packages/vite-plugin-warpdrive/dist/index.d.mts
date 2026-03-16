import { Plugin } from "vite";

//#region src/providers/types.d.ts
interface UploadProvider {
  getPublicUrl: (key: string) => string;
  upload: (localPath: string, key: string, contentType?: string) => Promise<void>;
  /**
   * Optionally clean a remote prefix before uploading new assets.
   */
  cleanPrefix?: (prefix: string) => Promise<void>;
  /**
   * Optionally determine if an upload can be skipped (e.g., hash/etag match).
   */
  shouldSkipUpload?: (localPath: string, key: string) => Promise<boolean>;
}
//#endregion
//#region src/providers/s3.d.ts
interface S3ProviderOptions {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  requestSizeInBytes?: number;
  requestAbortTimeout?: number;
  /**
   * Skip uploading when the remote object ETag matches the local content hash (MD5). Enabled by default.
   */
  skipNotModified?: boolean;
  /**
   * Public base URL used in rewritten assets. Defaults to endpoint.
   */
  publicBaseUrl?: string;
}
declare function createS3Provider(options: S3ProviderOptions): UploadProvider;
//#endregion
//#region src/index.d.ts
type IncludeMatcher = RegExp | ((filename: string) => boolean);
interface WarpDrivePluginOptions {
  provider: UploadProvider;
  /**
   * Prefix to prepend before the asset filename when uploading and when rewriting URLs.
   * e.g. `remote-assets` will produce `remote-assets/assets/duckdb-eh-123.wasm`.
   */
  prefix?: string;
  /**
   * Restrict which assets are rewritten/uploaded.
   */
  include?: IncludeMatcher[];
  /**
   * Optional extra predicate that receives filename + host info to decide inclusion.
   */
  includeBy?: (filename: string, ctx: {
    hostId?: string;
    hostType?: string;
  }) => boolean;
  /**
   * Optional content-type resolver. If omitted, uploads use the provider default.
   */
  contentTypeBy?: (filename: string) => Promise<string | undefined> | string | undefined;
  /**
   * Emit a manifest with module id + URL for debugging.
   */
  manifest?: boolean;
  /**
   * Delete the uploaded local asset from disk after upload completes. Enabled by default.
   */
  delete?: boolean;
  /**
   * Clean the remote prefix before uploading (delete existing objects). Enabled by default.
   */
  clean?: boolean;
  /**
   * When enabled, skip cleaning and uploading; emit manifest/rewrite URLs only.
   */
  dryRun?: boolean;
  /**
   * Skip uploading assets that are already present and not modified. Enabled by default when supported.
   */
  skipNotModified?: boolean;
}
declare function WarpDrivePlugin(options: WarpDrivePluginOptions): Plugin;
//#endregion
export { type S3ProviderOptions, type UploadProvider, WarpDrivePlugin, WarpDrivePluginOptions, createS3Provider };
//# sourceMappingURL=index.d.mts.map