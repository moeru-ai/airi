export interface UploadProvider {
  getPublicUrl: (key: string) => string
  upload: (localPath: string, key: string, contentType?: string) => Promise<void>
  /**
   * Optionally clean a remote prefix before uploading new assets.
   */
  cleanPrefix?: (prefix: string) => Promise<void>
  /**
   * Optionally determine if an upload can be skipped (e.g., hash/etag match).
   */
  shouldSkipUpload?: (localPath: string, key: string) => Promise<boolean>
}
